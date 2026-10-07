import { useCallback, useMemo } from "react";
import { HighlightWord } from "@/types";
import { useUserWords } from "./useUserWords";

const RECENT_WINDOW = 7 * 24 * 60 * 60 * 1000;

export function useReviewSystem() {
  const { userWords, mergeUserWord } = useUserWords();

  const getWordsToReview = useCallback(() => {
    const now = Date.now();
    return Object.values(userWords)
      .filter((item) => item.clicked && (!item.learned || now - item.lastSeen <= RECENT_WINDOW))
      .sort((a, b) => {
        if (a.learned !== b.learned) {
          return a.learned ? 1 : -1;
        }
        return b.lastSeen - a.lastSeen;
      });
  }, [userWords]);

  const dueItems = useMemo(() => getWordsToReview(), [getWordsToReview]);

  const addWrongWordsFromPractice = useCallback(
    (words: HighlightWord[], wordResults: Record<string, boolean>) => {
      const now = Date.now();
      words.forEach((item) => {
        if (wordResults[item.id] !== false) {
          return;
        }
        mergeUserWord({
          word: item.word,
          sentence: item.sentence,
          clicked: true,
          learned: false,
          lastSeen: now
        });
      });
    },
    [mergeUserWord]
  );

  const markReview = useCallback(
    (word: string, known: boolean) => {
      const key = word.trim().toLowerCase();
      const current = userWords[key];
      if (!current) {
        return;
      }
      mergeUserWord({
        ...current,
        clicked: true,
        learned: known,
        lastSeen: Date.now()
      });
    },
    [mergeUserWord, userWords]
  );

  return {
    dueItems,
    dueCount: dueItems.length,
    getWordsToReview,
    addWrongWordsFromPractice,
    markReview
  };
}
