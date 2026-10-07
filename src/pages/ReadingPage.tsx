import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { CompletionBanner } from "@/components/CompletionBanner";
import { EmptyCardHint } from "@/components/EmptyCardHint";
import { Header } from "@/components/Header";
import { MemoryCard } from "@/components/MemoryCard";
import { PracticeModal } from "@/components/PracticeModal";
import { ReadingArticle } from "@/components/ReadingArticle";
import { getArticleById } from "@/data/article";
import { usePronunciation } from "@/hooks/usePronunciation";
import { useLearningProgress } from "@/store/useLearningProgress";
import { useReviewSystem } from "@/store/useReviewSystem";
import { useUserWords } from "@/store/useUserWords";
import { MemoryCardContent, MemoryWord } from "@/types";
import { trackEvent } from "@/utils/analytics";
import { generateCard, regenerateCardInBackground } from "@/utils/generateCard";
import { findSentenceByPosition, splitSentencesWithRange, TextToken } from "@/utils/textParsing";

const emptyCard: MemoryCardContent = {
  meaning: "",
  reasoning: "",
  contrast: {
    baseWord: "basic word",
    baseMeaning: "通用表达",
    targetWord: "target",
    targetMeaning: "更贴合语境"
  },
  analogy: "",
  synonyms: [],
  mistake: "",
  oneLiner: ""
};

function mockIpa(word: string) {
  return `/${word.toLowerCase()}/`;
}

function hasChineseText(text: string | undefined) {
  if (!text) {
    return false;
  }
  return /[\u4e00-\u9fff]/.test(text);
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

export function ReadingPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const article = getArticleById(id);
  const { supported, speakingWord, pronounce, stop, message } = usePronunciation();
  const { progress, markWordSeen, markPracticeResult } = useLearningProgress();
  const { dueCount, addWrongWordsFromPractice } = useReviewSystem();
  const { userWords, upsertUserWord } = useUserWords();
  const requestIdRef = useRef(0);

  const [activeWord, setActiveWord] = useState<MemoryWord | null>(null);
  const [selectedSentenceRange, setSelectedSentenceRange] = useState<{ startIndex: number; endIndex: number } | null>(
    null
  );
  const [loadingCard, setLoadingCard] = useState(false);
  const [showPractice, setShowPractice] = useState(false);
  const [result, setResult] = useState<{ correct: number; total: number; wordResults: Record<string, boolean> } | null>(
    null
  );
  const [viewedWords, setViewedWords] = useState<Set<string>>(new Set());

  const sentences = useMemo(() => (article ? splitSentencesWithRange(article.content) : []), [article]);
  const suggestedWords = useMemo(
    () => (article ? article.highlights.map((item) => item.word).slice(0, 6) : []),
    [article]
  );

  const clickedWordsSet = useMemo(() => new Set(Array.from(viewedWords)), [viewedWords]);

  const articleClickedCount = useMemo(() => {
    if (!article) {
      return 0;
    }
    return viewedWords.size;
  }, [article, viewedWords]);

  const completed = article ? articleClickedCount >= Math.ceil(article.highlights.length * 0.6) : false;
  const hasPractice = article ? article.practice.length > 0 : false;

  useEffect(() => {
    setActiveWord(null);
    setSelectedSentenceRange(null);
    setLoadingCard(false);
    setShowPractice(false);
    setResult(null);
    setViewedWords(new Set());
    stop();
  }, [id, stop]);

  if (!article) {
    return (
      <main className="mx-auto max-w-3xl p-8">
        <p className="mb-4 text-sm text-ink-700">未找到该文章。</p>
        <Link to="/" className="rounded-xl border border-ink-200 px-4 py-2 text-sm font-semibold">
          返回首页
        </Link>
      </main>
    );
  }

  const handleCloseCard = () => {
    setActiveWord(null);
    setSelectedSentenceRange(null);
    stop();
  };

  const handleWordClick = async (token: TextToken) => {
    if (!token.isWord || !token.normalized) {
      return;
    }

    const sentenceRange = findSentenceByPosition(sentences, token.startIndex);
    const sentence = sentenceRange?.text ?? article.content;
    const clickTs = Date.now();

    trackEvent("word_click", {
      paperId: article.paperId || "unknown",
      articleId: article.id,
      word: token.text,
      sentenceLength: sentence.length
    });

    setSelectedSentenceRange(
      sentenceRange ? { startIndex: sentenceRange.startIndex, endIndex: sentenceRange.endIndex } : null
    );

    setViewedWords((prev) => {
      const next = new Set(prev);
      next.add(token.normalized!);
      return next;
    });
    markWordSeen(token.normalized);

    const fallbackFromPreset = article.highlights.find(
      (item) => item.word.toLowerCase() === token.normalized
    );

    const baseWord: MemoryWord = {
      word: token.text,
      sentence,
      ipa: fallbackFromPreset?.ipa ?? mockIpa(token.text),
      partOfSpeech: fallbackFromPreset?.partOfSpeech ?? "word",
      card: fallbackFromPreset?.card ?? { ...emptyCard, contrast: { ...emptyCard.contrast, targetWord: token.text } }
    };

    setActiveWord(baseWord);
    setLoadingCard(true);

    const currentRequestId = requestIdRef.current + 1;
    requestIdRef.current = currentRequestId;

    try {
      const generated = await generateCard(token.text, sentence);
      if (requestIdRef.current !== currentRequestId) {
        return;
      }
      const latencyMs = Date.now() - clickTs;
      const source = generated.meta?.source || "unknown";
      const errorCode = generated.meta?.errorCode || "";
      const hasChinese = cardHasChinese(generated);
      trackEvent("card_response", {
        paperId: article.paperId || "unknown",
        articleId: article.id,
        word: token.text,
        source,
        latencyMs,
        within3s: latencyMs <= 3000,
        success: source !== "fallback",
        hasChinese
      });
      if (source === "fallback") {
        trackEvent("card_error", {
          paperId: article.paperId || "unknown",
          articleId: article.id,
          word: token.text,
          errorCode: errorCode || "fallback_used"
        });

        // Keep trying once in background; if succeeds, replace fallback automatically.
        regenerateCardInBackground(token.text, sentence).then((recovered) => {
          if (!recovered) {
            return;
          }
          if (requestIdRef.current !== currentRequestId) {
            return;
          }
          setActiveWord((prev) => {
            if (!prev) {
              return prev;
            }
            if (prev.word !== token.text || prev.sentence !== sentence) {
              return prev;
            }
            return {
              ...prev,
              card: recovered
            };
          });
          trackEvent("card_auto_recover", {
            paperId: article.paperId || "unknown",
            articleId: article.id,
            word: token.text,
            source: recovered.meta?.source || "openrouter",
            hasChinese: cardHasChinese(recovered)
          });
        });
      }
      setActiveWord({
        ...baseWord,
        card: generated
      });
    } finally {
      if (requestIdRef.current === currentRequestId) {
        setLoadingCard(false);
      }
    }
  };

  const handlePracticeComplete = (nextResult: {
    correct: number;
    total: number;
    wordResults: Record<string, boolean>;
  }) => {
    setResult(nextResult);
    setShowPractice(false);
    Object.entries(nextResult.wordResults).forEach(([wordId, isCorrect]) => {
      markPracticeResult(wordId, isCorrect);
    });
    addWrongWordsFromPractice(article.highlights, nextResult.wordResults);
    trackEvent("practice_complete", {
      paperId: article.paperId || "unknown",
      articleId: article.id,
      correct: nextResult.correct,
      total: nextResult.total,
      accuracy: nextResult.total > 0 ? Number((nextResult.correct / nextResult.total).toFixed(4)) : 0
    });
  };

  const activeNormalized = activeWord?.word.trim().toLowerCase() || "";
  const isInWordbook = activeNormalized ? Boolean(userWords[activeNormalized]) : false;

  const handleAddToWordbook = (word: MemoryWord) => {
    upsertUserWord(word.word, word.sentence);
    trackEvent("wordbook_add", {
      paperId: article.paperId || "unknown",
      articleId: article.id,
      word: word.word
    });
  };

  const handleCardFeedback = (word: MemoryWord, accurate: boolean) => {
    trackEvent("card_feedback", {
      paperId: article.paperId || "unknown",
      articleId: article.id,
      word: word.word,
      accurate
    });
  };

  return (
    <main className="min-h-screen bg-transparent px-4 py-5 md:px-8 md:py-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
        <Header
          title="ContextVocab"
          subtitle="在真实语境中记住单词"
          modeLabel={article.modeLabel}
          level={article.level}
          category={article.category}
          exploredCount={articleClickedCount}
          totalCount={article.highlights.length}
        />

        <div className="rounded-2xl border border-ink-200 bg-white/90 px-4 py-3">
          <p className="text-xs font-semibold text-ink-500">建议关注</p>
          <p className="mt-1 text-sm text-ink-700">{suggestedWords.join(" · ")}</p>
        </div>

        {dueCount > 0 ? (
          <div className="rounded-2xl border border-accent-200 bg-accent-100/45 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-ink-700">你有 {dueCount} 个词待复习</p>
              <button
                type="button"
                onClick={() => navigate("/review")}
                className="rounded-xl bg-accent-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-700"
              >
                先复习
              </button>
            </div>
          </div>
        ) : null}

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
          <ReadingArticle
            title={article.title}
            content={article.content}
            selectedWord={activeWord?.word ?? null}
            selectedSentenceRange={selectedSentenceRange}
            clickedWords={clickedWordsSet}
            onClickWord={handleWordClick}
          />

          <div className="hidden lg:sticky lg:top-4 lg:block lg:self-start">
            {activeWord ? (
              <MemoryCard
                key={`${activeWord.word}-${activeWord.sentence}`}
                word={activeWord}
                loading={loadingCard}
                onClose={handleCloseCard}
                onPronounce={pronounce}
                onAddToWordbook={handleAddToWordbook}
                onCardFeedback={handleCardFeedback}
                isInWordbook={isInWordbook}
                pronunciationDisabled={!supported}
                isPlaying={speakingWord === activeWord.word}
                pronunciationMessage={message}
              />
            ) : (
              <EmptyCardHint />
            )}
          </div>
        </div>
      </div>

      {activeWord ? (
        <>
          <button
            type="button"
            aria-label="close drawer"
            onClick={handleCloseCard}
            className="fixed inset-0 z-20 bg-black/25 lg:hidden"
          />
          <div className="fixed inset-x-0 bottom-0 z-30 max-h-[78vh] overflow-y-auto rounded-t-3xl border border-ink-200 bg-white p-4 shadow-soft lg:hidden">
            <MemoryCard
              key={`mobile-${activeWord.word}-${activeWord.sentence}`}
              word={activeWord}
              loading={loadingCard}
              onClose={handleCloseCard}
              onPronounce={pronounce}
              onAddToWordbook={handleAddToWordbook}
              onCardFeedback={handleCardFeedback}
              isInWordbook={isInWordbook}
              pronunciationDisabled={!supported}
              isPlaying={speakingWord === activeWord.word}
              pronunciationMessage={message}
            />
          </div>
        </>
      ) : null}

      {hasPractice && completed && !result ? (
        <CompletionBanner
          exploredCount={articleClickedCount}
          totalCount={article.highlights.length}
          onStartPractice={() => setShowPractice(true)}
        />
      ) : null}

      {hasPractice && showPractice ? (
        <PracticeModal
          questions={article.practice}
          onClose={() => setShowPractice(false)}
          onComplete={handlePracticeComplete}
        />
      ) : null}

      {result ? (
        <div className="fixed bottom-4 left-1/2 z-20 w-[min(96%,760px)] -translate-x-1/2 rounded-2xl border border-ink-200 bg-white p-4 shadow-soft">
          <p className="text-sm text-ink-700">
            你掌握了 <span className="font-semibold text-accent-700">{result.correct}</span> / {result.total} 个词
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => navigate("/review")}
              className="rounded-xl bg-accent-500 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-700"
            >
              加入复习
            </button>
            <button
              type="button"
              onClick={() => setResult(null)}
              className="rounded-xl border border-ink-200 px-4 py-2 text-sm font-semibold text-ink-700"
            >
              继续阅读
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
