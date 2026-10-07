export const DICTIONARY_CACHE_STORAGE_KEY = "contextvocab_dictionary_cache";
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 4500;
const TRANSLATE_TIMEOUT_MS = 3500;

export type DictionaryMeaning = {
  word: string;
  partOfSpeech: string;
  definition: string; // 中文释义（主展示）
  definitionEn?: string; // 英文原释义（可选）
  example?: string; // 中文例句（若可翻译）
  exampleEn?: string; // 英文原例句（可选）
  source: "cache" | "free_dictionary" | "fallback";
  updatedAt: number;
};

type DictionaryCacheMap = Record<string, DictionaryMeaning>;

type DictionaryApiEntry = {
  meanings?: Array<{
    partOfSpeech?: string;
    definitions?: Array<{ definition?: string; example?: string }>;
  }>;
};

function normalizeWord(word: string) {
  return word.trim().toLowerCase();
}

function hasChineseText(text: string | undefined) {
  if (!text) return false;
  return /[\u4e00-\u9fff]/.test(text);
}

type MyMemoryResponse = {
  responseData?: { translatedText?: string };
};

async function translateToChinese(text: string): Promise<string | null> {
  const clean = String(text || "").trim();
  if (!clean) return null;

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), TRANSLATE_TIMEOUT_MS);
  try {
    const res = await fetch(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(clean)}&langpair=en|zh-CN`,
      { signal: controller.signal }
    );
    if (!res.ok) {
      return null;
    }
    const data = (await res.json()) as MyMemoryResponse;
    const translated = data.responseData?.translatedText?.trim();
    if (!translated || translated.toLowerCase() === clean.toLowerCase()) {
      return null;
    }
    return translated;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

function readMap(): DictionaryCacheMap {
  if (typeof window === "undefined") {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(DICTIONARY_CACHE_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as DictionaryCacheMap) : {};
  } catch {
    return {};
  }
}

function writeMap(map: DictionaryCacheMap) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(DICTIONARY_CACHE_STORAGE_KEY, JSON.stringify(map));
}

export function getDictionaryCache(word: string): DictionaryMeaning | null {
  const map = readMap();
  const item = map[normalizeWord(word)];
  if (!item) {
    return null;
  }
  if (Date.now() - item.updatedAt > THIRTY_DAYS_MS) {
    return null;
  }
  return {
    ...item,
    // 兼容老缓存：definition 仍是英文时，仍返回给上层做后续修复
    source: "cache"
  };
}

export function setDictionaryCache(item: Omit<DictionaryMeaning, "source" | "updatedAt">): DictionaryMeaning {
  const map = readMap();
  const next: DictionaryMeaning = {
    ...item,
    source: "free_dictionary",
    updatedAt: Date.now()
  };
  map[normalizeWord(item.word)] = next;
  writeMap(map);
  return next;
}

export async function fetchDictionaryMeaning(word: string): Promise<DictionaryMeaning> {
  const cache = getDictionaryCache(word);
  if (cache && hasChineseText(cache.definition)) {
    return cache;
  }

  // 老缓存迁移：若命中旧英文缓存，优先补中文并回写
  if (cache && !hasChineseText(cache.definition)) {
    const translated = await translateToChinese(cache.definition);
    const translatedExample = cache.example ? await translateToChinese(cache.example) : null;
    if (translated) {
      const upgraded = setDictionaryCache({
        word: cache.word,
        partOfSpeech: cache.partOfSpeech,
        definition: translated,
        definitionEn: cache.definition,
        example: translatedExample || cache.example,
        exampleEn: cache.example
      });
      return upgraded;
    }
  }

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`, {
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`http_${response.status}`);
    }
    const data = (await response.json()) as DictionaryApiEntry[];
    const first = Array.isArray(data) ? data[0] : null;
    const meaningGroup = first?.meanings?.[0];
    const definition = meaningGroup?.definitions?.[0];
    if (!definition?.definition) {
      throw new Error("empty_definition");
    }

    const definitionEn = definition.definition;
    const exampleEn = definition.example;
    const definitionZh = (await translateToChinese(definitionEn)) || "";
    const exampleZh = exampleEn ? await translateToChinese(exampleEn) : null;

    const saved = setDictionaryCache({
      word,
      partOfSpeech: meaningGroup?.partOfSpeech || "word",
      definition: definitionZh || "中文释义暂不可用，请稍后重试。",
      definitionEn,
      example: exampleZh || undefined,
      exampleEn
    });
    return saved;
  } catch {
    return {
      word,
      partOfSpeech: "word",
      definition: "词典中文释义暂不可用，请稍后重试。",
      definitionEn: undefined,
      source: "fallback",
      updatedAt: Date.now()
    };
  } finally {
    window.clearTimeout(timer);
  }
}
