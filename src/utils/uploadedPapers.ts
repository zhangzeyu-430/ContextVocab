export const UPLOADED_PAPERS_STORAGE_KEY = "contextvocab_uploaded_papers_v1";

export type UploadedPassage = {
  id: string;
  section?: string;
  title: string;
  level?: string;
  category?: string;
  modeLabel?: string;
  content: string;
  highlightSeeds?: Array<{
    id: string;
    word: string;
    sentence: string;
    ipa?: string;
    partOfSpeech?: string;
  }>;
};

export type UploadedPaperBundle = {
  paper: {
    id: string;
    exam: string;
    year: number;
    month: number;
    set: number;
    title: string;
  };
  passages: UploadedPassage[];
};

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

export function readUploadedPapers(): UploadedPaperBundle[] {
  return readJSON<UploadedPaperBundle[]>(UPLOADED_PAPERS_STORAGE_KEY, []);
}

export function upsertUploadedPaper(bundle: UploadedPaperBundle) {
  const list = readUploadedPapers();
  const next = [...list.filter((item) => item.paper.id !== bundle.paper.id), bundle];
  writeJSON(UPLOADED_PAPERS_STORAGE_KEY, next);
}

export function clearUploadedPapers() {
  writeJSON(UPLOADED_PAPERS_STORAGE_KEY, []);
}

