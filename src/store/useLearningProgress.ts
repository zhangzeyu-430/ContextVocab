import { useCallback, useState } from "react";
import { LearningProgress } from "@/types";

export const LEARNING_PROGRESS_STORAGE_KEY = "context_vocab_learning_progress_v1";

const defaultProgress: LearningProgress = { words: {} };

function readJSON<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") {
    return fallback;
  }
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON<T>(key: string, value: T) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function useLearningProgress() {
  const [progress, setProgress] = useState<LearningProgress>(() =>
    readJSON<LearningProgress>(LEARNING_PROGRESS_STORAGE_KEY, defaultProgress)
  );

  const markWordSeen = useCallback((wordId: string) => {
    setProgress((prev) => {
      const now = Date.now();
      const current = prev.words[wordId];
      const next: LearningProgress = {
        words: {
          ...prev.words,
          [wordId]: {
            seen: true,
            correct: current?.correct ?? 0,
            lastSeen: now
          }
        }
      };
      writeJSON(LEARNING_PROGRESS_STORAGE_KEY, next);
      return next;
    });
  }, []);

  const markPracticeResult = useCallback((wordId: string, isCorrect: boolean) => {
    setProgress((prev) => {
      const now = Date.now();
      const current = prev.words[wordId];
      const next: LearningProgress = {
        words: {
          ...prev.words,
          [wordId]: {
            seen: true,
            correct: (current?.correct ?? 0) + (isCorrect ? 1 : 0),
            lastSeen: now
          }
        }
      };
      writeJSON(LEARNING_PROGRESS_STORAGE_KEY, next);
      return next;
    });
  }, []);

  return {
    progress,
    markWordSeen,
    markPracticeResult
  };
}
