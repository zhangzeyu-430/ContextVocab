import { useCallback, useMemo, useState } from "react";

export const USER_WORDS_STORAGE_KEY = "contextvocab_user_words";

export type UserWordItem = {
  word: string;
  sentence: string;
  clicked: boolean;
  learned: boolean;
  lastSeen: number;
};

export type UserWordsMap = Record<string, UserWordItem>;

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

function normalize(word: string) {
  return word.trim().toLowerCase();
}

export function useUserWords() {
  const [userWords, setUserWords] = useState<UserWordsMap>(() =>
    readJSON<UserWordsMap>(USER_WORDS_STORAGE_KEY, {})
  );

  const upsertUserWord = useCallback((word: string, sentence: string) => {
    setUserWords((prev) => {
      const key = normalize(word);
      const now = Date.now();
      const current = prev[key];
      const next: UserWordsMap = {
        ...prev,
        [key]: {
          word,
          sentence,
          clicked: true,
          learned: current?.learned ?? false,
          lastSeen: now
        }
      };
      writeJSON(USER_WORDS_STORAGE_KEY, next);
      return next;
    });
  }, []);

  const mergeUserWord = useCallback((item: UserWordItem) => {
    setUserWords((prev) => {
      const key = normalize(item.word);
      const next: UserWordsMap = {
        ...prev,
        [key]: item
      };
      writeJSON(USER_WORDS_STORAGE_KEY, next);
      return next;
    });
  }, []);

  const removeUserWord = useCallback((word: string) => {
    setUserWords((prev) => {
      const key = normalize(word);
      if (!prev[key]) {
        return prev;
      }
      const next = { ...prev };
      delete next[key];
      writeJSON(USER_WORDS_STORAGE_KEY, next);
      return next;
    });
  }, []);

  const userWordCount = useMemo(() => Object.keys(userWords).length, [userWords]);

  return { userWords, userWordCount, upsertUserWord, mergeUserWord, removeUserWord };
}
