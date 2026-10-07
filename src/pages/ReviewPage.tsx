import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { getAllArticles } from "@/data/article";
import { useReviewSystem } from "@/store/useReviewSystem";
import { ReviewItem } from "@/types";
import { trackEvent } from "@/utils/analytics";
import { getCache } from "@/utils/cardCache";

function toBlankSentence(sentence: string, word: string) {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`\\b${escaped}\\b`, "i");
  return sentence.replace(regex, "______");
}

function getFallbackOneLiner(word: string): string {
  const lower = word.toLowerCase();
  for (const article of getAllArticles()) {
    const found = article.highlights.find((item) => item.word.toLowerCase() === lower);
    if (found?.card.oneLiner) {
      return found.card.oneLiner;
    }
  }
  return `${word}：放回原句理解，再记它的语气和作用。`;
}

function getFallbackMeaning(word: string): string {
  const lower = word.toLowerCase();
  for (const article of getAllArticles()) {
    const found = article.highlights.find((item) => item.word.toLowerCase() === lower);
    if (found?.card.meaning) {
      return found.card.meaning;
    }
  }
  return `${word} 在当前语境里的意思需要结合整句判断。`;
}

export function ReviewPage() {
  const { getWordsToReview, markReview } = useReviewSystem();
  const [sessionQueue, setSessionQueue] = useState<ReviewItem[]>(() => getWordsToReview());
  const [showAnswer, setShowAnswer] = useState(false);
  const [doneCount, setDoneCount] = useState(0);
  const completedTrackedRef = useRef(false);
  const [initialQueue] = useState<ReviewItem[]>(() => getWordsToReview());
  const [initialCount] = useState(initialQueue.length);
  const [initialNextDayDueCount] = useState(() => {
    const DAY_MS = 24 * 60 * 60 * 1000;
    const now = Date.now();
    return initialQueue.filter((item) => now - item.lastSeen >= DAY_MS).length;
  });

  const current = sessionQueue[0];

  const answerContent = useMemo(() => {
    if (!current) {
      return {
        oneLiner: "",
        meaning: "",
        fromCache: false
      };
    }

    const cached = getCache(current.word);
    if (cached?.card) {
      return {
        oneLiner: cached.card.oneLiner || getFallbackOneLiner(current.word),
        meaning: cached.card.meaning || getFallbackMeaning(current.word),
        fromCache: true
      };
    }

    return {
      oneLiner: getFallbackOneLiner(current.word),
      meaning: getFallbackMeaning(current.word),
      fromCache: false
    };
  }, [current]);

  const handleResult = (known: boolean) => {
    if (!current) {
      return;
    }
    markReview(current.word, known);
    trackEvent("review_submit", {
      word: current.word,
      known,
      hasCacheCard: answerContent.fromCache
    });
    setDoneCount((prev) => prev + 1);
    setSessionQueue((prev) => prev.slice(1));
    setShowAnswer(false);
  };

  useEffect(() => {
    if (completedTrackedRef.current) {
      return;
    }
    if (initialCount > 0 && sessionQueue.length === 0) {
      completedTrackedRef.current = true;
      trackEvent("review_session_complete", {
        initialCount,
        doneCount,
        nextDayDueCount: initialNextDayDueCount,
        nextDayCompletedCount: Math.min(doneCount, initialNextDayDueCount)
      });
    }
  }, [doneCount, initialCount, initialNextDayDueCount, sessionQueue.length]);

  if (initialCount === 0) {
    return (
      <main className="min-h-screen px-4 py-8 md:px-8">
        <div className="mx-auto max-w-3xl rounded-2xl border border-ink-200 bg-white p-6 shadow-soft">
          <h1 className="text-2xl font-semibold text-ink-900">今日复习</h1>
          <p className="mt-3 text-sm text-ink-600">暂无待复习词</p>
          <Link
            to="/"
            className="mt-4 inline-flex rounded-xl border border-ink-200 px-4 py-2 text-sm font-semibold text-ink-700"
          >
            去首页
          </Link>
        </div>
      </main>
    );
  }

  if (!current) {
    return (
      <main className="min-h-screen px-4 py-8 md:px-8">
        <div className="mx-auto max-w-3xl rounded-2xl border border-ink-200 bg-white p-6 shadow-soft">
          <h1 className="text-2xl font-semibold text-ink-900">今日复习完成 🎉</h1>
          <p className="mt-3 text-sm text-ink-600">你复习了 {doneCount} 个词</p>
          <Link
            to="/"
            className="mt-4 inline-flex rounded-xl border border-ink-200 px-4 py-2 text-sm font-semibold text-ink-700"
          >
            返回首页
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 py-8 md:px-8">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="rounded-2xl border border-ink-200 bg-white p-6 shadow-soft">
          <div className="mb-4 flex items-center justify-between">
            <h1 className="text-2xl font-semibold text-ink-900">今日复习（{sessionQueue.length}）</h1>
            <Link to="/" className="rounded-full border border-ink-200 px-3 py-1 text-xs font-semibold text-ink-700">
              返回首页
            </Link>
          </div>

          <p className="rounded-xl bg-ink-50 p-4 text-base leading-7 text-ink-800">
            {toBlankSentence(current.sentence, current.word)}
          </p>

          {!showAnswer ? (
            <button
              type="button"
              onClick={() => {
                trackEvent("review_show_answer", {
                  word: current.word
                });
                setShowAnswer(true);
              }}
              className="mt-4 rounded-xl bg-ink-900 px-4 py-2 text-sm font-semibold text-white"
            >
              显示答案
            </button>
          ) : (
            <div className="mt-4 space-y-3">
              <p className="text-sm text-ink-700">
                答案：<span className="font-semibold text-accent-700">{current.word}</span>
              </p>
              <p className="rounded-xl border border-accent-200 bg-accent-100/40 p-3 text-sm text-ink-700">
                👉 {answerContent.oneLiner}
              </p>
              <p className="rounded-xl border border-ink-200 bg-white p-3 text-sm text-ink-700">
                {answerContent.meaning}
              </p>
              {!answerContent.fromCache ? (
                <p className="text-xs text-amber-600">当前词暂无缓存卡片，显示的是基础解释。</p>
              ) : null}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleResult(true)}
                  className="rounded-xl bg-accent-500 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-700"
                >
                  我会
                </button>
                <button
                  type="button"
                  onClick={() => handleResult(false)}
                  className="rounded-xl border border-ink-200 px-4 py-2 text-sm font-semibold text-ink-700"
                >
                  我不会
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
