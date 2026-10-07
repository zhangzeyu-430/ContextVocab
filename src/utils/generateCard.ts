import { MemoryCardContent } from "@/types";
import { localLexicon } from "@/data/localLexicon";
import { buildApiUrl } from "@/utils/api";
import { getCache, setCache } from "./cardCache";

const inFlightRequests = new Map<string, Promise<MemoryCardContent>>();
const inFlightDictionary = new Map<string, Promise<MemoryCardContent | null>>();
const translationCache = new Map<string, string | null>();
const BACKEND_TIMEOUT_MS = 11000;
const DICTIONARY_TIMEOUT_MS = 3500;
const BACKGROUND_RECOVER_ATTEMPTS = 3;
const BACKGROUND_RECOVER_WAIT_MS = 900;
const QUALITY_PASS_SCORE = 70;

const FUNCTION_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "if", "while", "when", "where", "which", "who", "whom",
  "whose", "that", "this", "these", "those", "of", "to", "in", "on", "at", "for", "from", "with",
  "by", "as", "is", "am", "are", "was", "were", "be", "been", "being", "do", "does", "did",
  "have", "has", "had", "it", "its", "they", "them", "their", "you", "your", "we", "our", "i",
  "me", "my", "he", "she", "his", "her", "not", "no", "yes"
]);

type BackendCardResponse = {
  source?: "server_cache" | "openrouter" | "fallback";
  latencyMs?: number;
  errorCode?: string;
  card?: Partial<MemoryCardContent>;
};

type GenerateCardOptions = {
  bypassLocalCache?: boolean;
  skipFallback?: boolean;
  skipAi?: boolean;
};

type DictionaryApiEntry = {
  meanings?: Array<{
    partOfSpeech?: string;
    definitions?: Array<{ definition?: string; example?: string; synonyms?: string[] }>;
    synonyms?: string[];
  }>;
};

type MyMemoryResponse = {
  responseData?: {
    translatedText?: string;
  };
};

type QualityResult = {
  score: number;
  reasons: string[];
};

function normalizeCard(
  word: string,
  payload: Partial<MemoryCardContent>,
  meta?: MemoryCardContent["meta"]
): MemoryCardContent {
  const safeSynonyms =
    payload.synonyms && payload.synonyms.length > 0
      ? payload.synonyms.slice(0, 3)
      : ["related", "similar"];

  return {
    meaning: payload.meaning || `${word} should be interpreted with sentence context.`,
    reasoning: payload.reasoning || `${word} carries more specific nuance in this sentence.`,
    contrast: {
      baseWord: payload.contrast?.baseWord || "basic word",
      baseMeaning: payload.contrast?.baseMeaning || "neutral meaning",
      targetWord: payload.contrast?.targetWord || word,
      targetMeaning: payload.contrast?.targetMeaning || "context-specific meaning"
    },
    analogy: payload.analogy || `Think of ${word} as a context-first expression.`,
    synonyms: safeSynonyms,
    mistake: payload.mistake || `Avoid memorizing ${word} out of context.`,
    oneLiner: payload.oneLiner || `${word}: understand in context, then memorize.`,
    meta: {
      isOfflineFallback: Boolean(payload.meta?.isOfflineFallback),
      source: meta?.source || payload.meta?.source,
      latencyMs: meta?.latencyMs ?? payload.meta?.latencyMs,
      errorCode: meta?.errorCode || payload.meta?.errorCode
    }
  };
}

function fallbackCard(word: string, meta?: MemoryCardContent["meta"]): MemoryCardContent {
  return {
    meaning: `${word} roughly expresses an action or state in this sentence.`,
    reasoning: "The meaning should be inferred from context.",
    contrast: {
      baseWord: "basic word",
      baseMeaning: "more neutral",
      targetWord: word,
      targetMeaning: "more context-specific"
    },
    analogy: "Treat it as a real-life expression used in this scenario.",
    synonyms: ["similar", "related"],
    mistake: "Do not rely on literal translation only.",
    oneLiner: `${word}: read the sentence first.`,
    meta: {
      isOfflineFallback: true,
      source: meta?.source || "fallback",
      latencyMs: meta?.latencyMs,
      errorCode: meta?.errorCode
    }
  };
}

function normalizeWord(word: string) {
  return word.trim().toLowerCase();
}

function normalizeLookupWord(word: string) {
  return normalizeWord(word).replace(/[^a-z']/g, "");
}

function getLookupCandidates(word: string) {
  const w = normalizeLookupWord(word);
  if (!w) return [];
  const candidates = new Set<string>([w]);
  if (w.endsWith("ies") && w.length > 4) candidates.add(`${w.slice(0, -3)}y`);
  if (w.endsWith("es") && w.length > 4) candidates.add(w.slice(0, -2));
  if (w.endsWith("s") && w.length > 3) candidates.add(w.slice(0, -1));
  if (w.endsWith("ing") && w.length > 5) candidates.add(w.slice(0, -3));
  if (w.endsWith("ed") && w.length > 4) candidates.add(w.slice(0, -2));
  return Array.from(candidates).filter(Boolean);
}

function hasChineseText(text: string | undefined) {
  if (!text) {
    return false;
  }
  return /[\u4e00-\u9fff]/.test(text);
}

function countChineseChars(text: string | undefined) {
  if (!text) {
    return 0;
  }
  const matched = text.match(/[\u4e00-\u9fff]/g);
  return matched ? matched.length : 0;
}

function countEnglishLetters(text: string | undefined) {
  if (!text) {
    return 0;
  }
  const matched = text.match(/[A-Za-z]/g);
  return matched ? matched.length : 0;
}

function looksEnglishDominant(text: string | undefined) {
  const zh = countChineseChars(text);
  const en = countEnglishLetters(text);
  return en > Math.max(14, zh * 1.6);
}

function trimMeaning(text: string, max = 26) {
  const first = text.split(/[����;,.!?��������]/)[0].trim();
  return first.slice(0, max);
}

function extractContextWindow(sentence: string, word: string) {
  const lowerSentence = sentence.toLowerCase();
  const lowerWord = word.toLowerCase();
  const idx = lowerSentence.indexOf(lowerWord);
  if (idx < 0) {
    return sentence.slice(0, 120);
  }
  const start = Math.max(0, idx - 42);
  const end = Math.min(sentence.length, idx + word.length + 42);
  return sentence.slice(start, end);
}

function cardHasChinese(card: MemoryCardContent) {
  return [
    card.meaning,
    card.reasoning,
    card.analogy,
    card.mistake,
    card.oneLiner,
    card.contrast?.baseMeaning,
    card.contrast?.targetMeaning
  ].some((item) => hasChineseText(item));
}

function isGenericContrast(card: MemoryCardContent) {
  const baseMeaning = card.contrast?.baseMeaning || "";
  const targetMeaning = card.contrast?.targetMeaning || "";
  return (
    baseMeaning.includes("�ʵ����ͨ������") ||
    targetMeaning.includes("�ڵ�ǰ������ľ��庬��") ||
    targetMeaning.includes("context-specific")
  );
}

function isFunctionWord(word: string) {
  return FUNCTION_WORDS.has(normalizeWord(word));
}

function buildFunctionWordHintCard(word: string, sentence: string): MemoryCardContent {
  return normalizeCard(
    word,
    {
      meaning: `��${word}�������������﷨֧�Ŵʣ�ѧϰ���ȼ��ϵ͡������ȵ�ʵ��ʣ�����/����/���ݴʣ���`,
      reasoning: "���ܴ�ͨ������䷨���ӣ������ǳ��غ�����Ϣ��",
      contrast: {
        baseWord: "���ܴ�",
        baseMeaning: "�������ӽṹ����",
        targetWord: "ʵ���",
        targetMeaning: "���������Ķ������Ч��"
      },
      analogy: `��ץ��˭����ʲô�������������ĺ��Ķ���������ٻ�������${word}����`,
      synonyms: [],
      mistake: "��Ҫ��ѧϰʱ��ƽ���ָ����дʣ��Ƚ��Ӱ�����Ĺؼ��ʡ�",
      oneLiner: `${word}�������������ȹ���ʵ��ʡ�`
    },
    {
      source: "function_word_hint",
      latencyMs: 0
    }
  );
}

function evaluateCardQuality(card: MemoryCardContent, sentence: string): QualityResult {
  let score = 100;
  const reasons: string[] = [];

  if (!cardHasChinese(card)) {
    score -= 40;
    reasons.push("no_chinese");
  }
  if (isGenericContrast(card)) {
    score -= 20;
    reasons.push("generic_contrast");
  }
  if (looksEnglishDominant(card.meaning)) {
    score -= 15;
    reasons.push("english_dominant_meaning");
  }
  if (looksEnglishDominant(card.oneLiner)) {
    score -= 10;
    reasons.push("english_dominant_hook");
  }
  if (countChineseChars(card.meaning) < 8) {
    score -= 20;
    reasons.push("too_short_meaning");
  }
  if (/in a successful manner|without failing|in this sentence/i.test(card.meaning)) {
    score -= 20;
    reasons.push("raw_dictionary_sense");
  }
  if (isProgrammingFalseSense(card, sentence)) {
    score -= 25;
    reasons.push("programming_false_sense");
  }

  return {
    score: Math.max(0, score),
    reasons
  };
}

function getPhraseCandidates(sentence: string, word: string) {
  const tokens = sentence.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) || [];
  const lowerWord = word.toLowerCase();
  const hitIndex = tokens.findIndex((token) => token.toLowerCase() === lowerWord);
  if (hitIndex < 0) {
    return [];
  }
  const prev = tokens[hitIndex - 1];
  const curr = tokens[hitIndex];
  const next = tokens[hitIndex + 1];
  const candidates = [
    prev && curr ? `${prev} ${curr}` : "",
    curr && next ? `${curr} ${next}` : "",
    prev && curr && next ? `${prev} ${curr} ${next}` : ""
  ].filter(Boolean);
  return Array.from(new Set(candidates));
}

function isProgrammingFalseSense(card: MemoryCardContent, sentence: string) {
  const text = [
    card.meaning,
    card.reasoning,
    card.oneLiner,
    card.contrast?.baseMeaning,
    card.contrast?.targetMeaning
  ]
    .join(" ")
    .toLowerCase();
  const hasProgrammingTerms = /(true|false|�������|�߼����ʽ|���|����|�������|����)/.test(text);
  if (!hasProgrammingTerms) {
    return false;
  }
  const sentenceLower = sentence.toLowerCase();
  const sentenceHasCodingCue = /(code|coding|program|software|algorithm|debug|compiler|script|api)/.test(sentenceLower);
  return !sentenceHasCodingCue;
}

function isLowQualityCard(card: MemoryCardContent, sentence: string) {
  const quality = evaluateCardQuality(card, sentence);
  if ((card.oneLiner || "").includes("�ʵ������") || (card.oneLiner || "").includes("�ﾳ����")) {
    return true;
  }
  return quality.score < QUALITY_PASS_SCORE;
}

async function translateToChinese(text: string): Promise<string | null> {
  const clean = text.trim();
  if (!clean) {
    return null;
  }
  if (translationCache.has(clean)) {
    return translationCache.get(clean) ?? null;
  }

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort("timeout"), DICTIONARY_TIMEOUT_MS);
  try {
    const response = await fetch(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(clean)}&langpair=en|zh-CN`,
      { signal: controller.signal }
    );
    if (!response.ok) {
      translationCache.set(clean, null);
      return null;
    }
    const data = (await response.json()) as MyMemoryResponse;
    const translated = data.responseData?.translatedText?.trim();
    if (!translated || translated.toLowerCase() === clean.toLowerCase()) {
      translationCache.set(clean, null);
      return null;
    }
    translationCache.set(clean, translated);
    return translated;
  } catch {
    translationCache.set(clean, null);
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

async function fetchCardFromFreeDictionary(word: string, sentence: string): Promise<MemoryCardContent | null> {
  const normalizedWord = normalizeLookupWord(word);
  const existing = inFlightDictionary.get(normalizedWord);
  if (existing) {
    return existing;
  }

  const task = (async () => {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort("timeout"), DICTIONARY_TIMEOUT_MS);
  const startedAt = performance.now();

  try {
    let entry: DictionaryApiEntry | null = null;
    const candidates = getLookupCandidates(word);
    for (const candidate of candidates) {
      // eslint-disable-next-line no-await-in-loop
      const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(candidate)}`, {
        signal: controller.signal
      });
      if (!response.ok) {
        // eslint-disable-next-line no-continue
        continue;
      }
      // eslint-disable-next-line no-await-in-loop
      const data = (await response.json()) as DictionaryApiEntry[];
      entry = Array.isArray(data) ? data[0] : null;
      if (entry) {
        break;
      }
    }
    if (!entry) {
      return null;
    }
    const meaningGroup = entry?.meanings?.[0];
    const definition = meaningGroup?.definitions?.[0];
    const definitionText = definition?.definition?.trim();
    if (!definitionText) {
      return null;
    }

    const pos = (meaningGroup?.partOfSpeech || "").toLowerCase();
    const posLabel =
      pos === "noun"
        ? "����"
        : pos === "verb"
          ? "����"
          : pos === "adjective"
            ? "���ݴ�"
            : pos === "adverb"
              ? "����"
              : "����";

    const zhDefinition = await translateToChinese(definitionText);

    const contextWindow = extractContextWindow(sentence, word);
    const contextZh = await translateToChinese(contextWindow);
    const phraseCandidates = getPhraseCandidates(sentence, word);
    let phraseZh: string | null = null;
    let phraseLabel = "";
    for (const phrase of phraseCandidates) {
      const translated = await translateToChinese(phrase);
      if (translated && countChineseChars(translated) >= 4 && !looksEnglishDominant(translated)) {
        phraseZh = translated;
        phraseLabel = phrase;
        break;
      }
    }
    const contextHint =
      contextZh && countChineseChars(contextZh) >= 6
        ? trimMeaning(contextZh, 30)
        : "�þ�ǿ������ʵ�ʶ����е�����";

    const finalDefinition =
      zhDefinition && countChineseChars(zhDefinition) >= 6 && !looksEnglishDominant(zhDefinition)
        ? zhDefinition
        : `�ʵ�Ӣ�ͣ�${definitionText}`;
    const baseMeaning = trimMeaning(finalDefinition, 28);
    const targetMeaning = phraseZh
      ? `������ӽ����${trimMeaning(phraseZh, 24)}�������˼`
      : `�ڱ����и�ƫ��${contextHint}��`;
    const shortMeaning = phraseZh ? trimMeaning(phraseZh, 20) : trimMeaning(finalDefinition, 20);

    const synonyms = [
      ...(definition?.synonyms || []),
      ...(meaningGroup?.synonyms || [])
    ]
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 3);

    const latencyMs = Math.round(performance.now() - startedAt);
    return normalizeCard(
      word,
      {
        meaning: `������������${word}�������Ϊ��${finalDefinition}`,
        reasoning: phraseZh
          ? `���ھ�����Ҫ�䵱${posLabel}�����롰${phraseLabel}���γɹ̶�������䡣`
          : `���ھ�����Ҫ�䵱${posLabel}���ص㲻���ֵ�ֱ�룬���ǡ�${contextHint}������ﾳ���ܡ�`,
        contrast: {
          baseWord: `${word}���ʵ䣩`,
          baseMeaning,
          targetWord: phraseLabel ? `${word}��������䣩` : `${word}�����䣩`,
          targetMeaning
        },
        analogy: phraseZh
          ? `�����Ż�ԭ�俴�����������˵��${trimMeaning(phraseZh, 30)}����������ֻ�����ʱ����`
          : `�����Ż�ԭ�俴�����������˵��${contextHint}���������ǹ������ʡ�`,
        synonyms: synonyms.length > 0 ? synonyms : ["related", "similar"],
        mistake: "��Ҫֻ��������壻��������ʱ�ȿ����ڶ����������ʲô��ɫ��",
        oneLiner: `${word}���������${shortMeaning}����`
      },
      {
        source: "free_dictionary",
        latencyMs
      }
    );
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
  })().finally(() => {
    inFlightDictionary.delete(normalizedWord);
  });

  inFlightDictionary.set(normalizedWord, task);
  return task;
}

function getCardFromLocalLexicon(word: string): MemoryCardContent | null {
  const key = normalizeWord(word);
  const item = localLexicon[key];
  if (!item) {
    return null;
  }

  return normalizeCard(
    word,
    {
      meaning: `�ﾳ���ͣ�${item.meaning}`,
      reasoning: `Ϊʲô������ʣ�${item.reasoning}`,
      contrast: {
        baseWord: item.baseWord || "�������",
        baseMeaning: item.baseMeaning || "�����Ե�ͨ����˼",
        targetWord: word,
        targetMeaning: item.targetMeaning || "���������������е���˼"
      },
      analogy: `��ȼ��䣺${item.analogy}`,
      synonyms: item.synonyms,
      mistake: `�״�㣺${item.mistake}`,
      oneLiner: item.oneLiner.includes("��") ? item.oneLiner : `${word}��${item.oneLiner}`
    },
    {
      source: "local_lexicon",
      latencyMs: 0
    }
  );
}

async function fetchCardFromBackend(
  word: string,
  sentence: string
): Promise<{ ok: true; card: MemoryCardContent } | { ok: false; errorCode: string; latencyMs: number }> {
  const startedAt = performance.now();
  const controller = new AbortController();
  let timedOut = false;
  const timer = window.setTimeout(() => {
    timedOut = true;
    controller.abort("timeout");
  }, BACKEND_TIMEOUT_MS);

  try {
    const response = await fetch(buildApiUrl("/api/card"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ word, sentence }),
      signal: controller.signal
    });

    const latencyMs = Math.round(performance.now() - startedAt);
    if (!response.ok) {
      return { ok: false, errorCode: `http_${response.status}`, latencyMs };
    }

    const data = (await response.json()) as BackendCardResponse;
    if (!data.card) {
      return { ok: false, errorCode: "empty_card", latencyMs };
    }

    return {
      ok: true,
      card: normalizeCard(word, data.card, {
        source: data.source || "openrouter",
        latencyMs: data.latencyMs ?? latencyMs,
        errorCode: data.errorCode
      })
    };
  } catch {
    const latencyMs = Math.round(performance.now() - startedAt);
    if (timedOut || controller.signal.aborted) {
      return { ok: false, errorCode: "timeout", latencyMs };
    }
    return { ok: false, errorCode: "network_error", latencyMs };
  } finally {
    window.clearTimeout(timer);
  }
}

async function fetchWithRetry(word: string, sentence: string) {
  const first = await fetchCardFromBackend(word, sentence);
  if (first.ok) {
    return first;
  }

  if (first.errorCode === "network_error") {
    await new Promise((resolve) => window.setTimeout(resolve, 180));
    const second = await fetchCardFromBackend(word, sentence);
    return second;
  }

  return first;
}

async function internalGenerateCard(word: string, sentence: string, options: GenerateCardOptions): Promise<MemoryCardContent> {
  if (isFunctionWord(word)) {
    return buildFunctionWordHintCard(word, sentence);
  }

  if (!options.bypassLocalCache) {
    const cacheHit = getCache(word);
    if (cacheHit && !cacheHit.card.meta?.isOfflineFallback) {
      const normalizedCache = normalizeCard(word, cacheHit.card, {
        ...cacheHit.card.meta,
        source: "local_cache",
        latencyMs: 0
      });
      if (!isLowQualityCard(normalizedCache, sentence) || options.skipAi) {
        return normalizedCache;
      }
    }
  }

  // ������ȡ�ʵ���AI�����ȷ��ء��㹻���Ҹ��족�Ľ�������3�������
  const dictionaryPromise = fetchCardFromFreeDictionary(word, sentence);
  const backendPromise = options.skipAi ? null : fetchWithRetry(word, sentence);
  let dictionaryQuality: QualityResult | null = null;
  let dictionaryCard: MemoryCardContent | null = null;
  try {
    dictionaryCard = await dictionaryPromise;
  } catch {
    dictionaryCard = null;
  }
  if (dictionaryCard) {
    dictionaryQuality = evaluateCardQuality(dictionaryCard, sentence);
    if (dictionaryQuality.score >= QUALITY_PASS_SCORE) {
      setCache(word, sentence, dictionaryCard);
      // ��̨��AI���޻��棬������ǰ̨����
      if (backendPromise) {
        backendPromise.then((backend) => {
          if (!backend.ok) return;
          const normalized = backend.card;
          if (!normalized.meta?.isOfflineFallback && !isLowQualityCard(normalized, sentence)) {
            setCache(word, sentence, normalized);
          }
        });
      }
      return dictionaryCard;
    }
  }

  let backendErrorCode = "ai_skipped";
  let backendLatency = 0;
  if (!options.skipAi) {
    const backend = backendPromise ? await backendPromise : await fetchWithRetry(word, sentence);
    if (backend.ok) {
      const normalized = backend.card;
      if (
        !normalized.meta?.isOfflineFallback &&
        !isLowQualityCard(normalized, sentence)
      ) {
        setCache(word, sentence, normalized);
      }
      if (!isLowQualityCard(normalized, sentence)) {
        return normalized;
      }
      backendErrorCode = "ai_low_quality";
    }
    if (!backend.ok) {
      backendErrorCode = backend.errorCode;
      backendLatency = backend.latencyMs;
    }
  }

  // AI���ѵ��ʵ�ɶ�ʱ�����ȴʵ䣬����ֱ��fallback
  if (dictionaryCard && dictionaryQuality && dictionaryQuality.score >= QUALITY_PASS_SCORE - 12) {
    setCache(word, sentence, dictionaryCard);
    return dictionaryCard;
  }

  const localLexiconCard = getCardFromLocalLexicon(word);
  if (localLexiconCard && !isLowQualityCard(localLexiconCard, sentence)) {
    setCache(word, sentence, localLexiconCard);
    return localLexiconCard;
  }

  const cachedAfterError = getCache(word);
  if (cachedAfterError && !cachedAfterError.card.meta?.isOfflineFallback) {
    const normalizedCached = normalizeCard(word, cachedAfterError.card, {
      ...cachedAfterError.card.meta,
      source: "local_cache",
      errorCode: backendErrorCode
    });
    if (!isLowQualityCard(normalizedCached, sentence)) {
      return normalizedCached;
    }
  }

  if (options.skipFallback) {
    const dictionaryReason = dictionaryQuality
      ? `dict_score_${dictionaryQuality.score}_${dictionaryQuality.reasons.join("-")}`
      : "";
    throw new Error([backendErrorCode || "backend_error", dictionaryReason].filter(Boolean).join("|"));
  }

  return fallbackCard(word, {
    source: "fallback",
    latencyMs: backendLatency,
    errorCode: backendErrorCode
  });
}

export async function generateCard(
  word: string,
  sentence: string,
  options: GenerateCardOptions = {}
): Promise<MemoryCardContent> {
  const requestKey = `${word.trim().toLowerCase()}::${options.bypassLocalCache ? "fresh" : "normal"}::${options.skipAi ? "noai" : "ai"}`;
  const existingRequest = inFlightRequests.get(requestKey);
  if (existingRequest) {
    return existingRequest;
  }

  const task = internalGenerateCard(word, sentence, options).finally(() => {
    inFlightRequests.delete(requestKey);
  });

  inFlightRequests.set(requestKey, task);
  return task;
}

export async function regenerateCardInBackground(
  word: string,
  sentence: string
): Promise<MemoryCardContent | null> {
  for (let i = 0; i < BACKGROUND_RECOVER_ATTEMPTS; i += 1) {
    try {
      const result = await internalGenerateCard(word, sentence, {
        bypassLocalCache: true,
        skipFallback: true
      });
      if (result.meta?.source !== "fallback") {
        return result;
      }
    } catch {
      // keep retrying in background
    }

    if (i < BACKGROUND_RECOVER_ATTEMPTS - 1) {
      await new Promise((resolve) => window.setTimeout(resolve, BACKGROUND_RECOVER_WAIT_MS));
    }
  }
  return null;
}

