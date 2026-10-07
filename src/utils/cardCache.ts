import { MemoryCardContent } from "@/types";

export const CARD_CACHE_STORAGE_KEY = "contextvocab_card_cache";
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export type CardCacheItem = {
  word: string;
  sentence: string;
  card: MemoryCardContent;
  updatedAt: number;
};

type CardCacheMap = Record<string, CardCacheItem>;

function readCacheMap(): CardCacheMap {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(CARD_CACHE_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CardCacheMap) : {};
  } catch {
    return {};
  }
}

function writeCacheMap(map: CardCacheMap) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(CARD_CACHE_STORAGE_KEY, JSON.stringify(map));
}

function normalizeWord(word: string) {
  return word.trim().toLowerCase();
}

export function getCache(word: string): CardCacheItem | null {
  const map = readCacheMap();
  const key = normalizeWord(word);
  const item = map[key];
  if (!item) {
    return null;
  }

  // Optional policy: refresh cache older than 30 days.
  if (Date.now() - item.updatedAt > THIRTY_DAYS_MS) {
    return null;
  }

  return item;
}

export function setCache(word: string, sentence: string, card: MemoryCardContent): CardCacheItem {
  const map = readCacheMap();
  const key = normalizeWord(word);
  const item: CardCacheItem = {
    word,
    sentence,
    card,
    updatedAt: Date.now()
  };
  map[key] = item;
  writeCacheMap(map);
  return item;
}
