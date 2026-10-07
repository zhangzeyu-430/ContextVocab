export type ExamType = "考研" | "六级" | "雅思";

export type MemoryCardContent = {
  meaning: string;
  reasoning: string;
  contrast: {
    baseWord: string;
    baseMeaning: string;
    targetWord: string;
    targetMeaning: string;
  };
  analogy: string;
  synonyms: string[];
  mistake: string;
  oneLiner: string;
  meta?: {
    isOfflineFallback?: boolean;
    source?:
      | "local_cache"
      | "function_word_hint"
      | "free_dictionary"
      | "local_lexicon"
      | "server_cache"
      | "openrouter"
      | "fallback";
    latencyMs?: number;
    errorCode?: string;
  };
};

export type MemoryWord = {
  word: string;
  sentence: string;
  ipa?: string;
  partOfSpeech?: string;
  card: MemoryCardContent;
};

export type HighlightWord = {
  id: string;
  word: string;
  sentence: string;
  startIndex: number;
  endIndex: number;
  sentenceStartIndex: number;
  sentenceEndIndex: number;
  ipa: string;
  partOfSpeech: string;
  card: MemoryCardContent;
};

export type PracticeFillBlankQuestion = {
  id: string;
  type: "fill_blank";
  prompt: string;
  answer: string;
  wordId: string;
  explanation?: string;
};

export type PracticeChoiceQuestion = {
  id: string;
  type: "choice";
  prompt: string;
  options: string[];
  answer: string;
  wordId: string;
  explanation?: string;
};

export type PracticeQuestion = PracticeFillBlankQuestion | PracticeChoiceQuestion;

export type Article = {
  id: string;
  exam: ExamType;
  year?: number;
  month?: number;
  set?: number;
  paperId?: string;
  section?: string;
  title: string;
  level: string;
  category: string;
  modeLabel: string;
  content: string;
  highlights: HighlightWord[];
  practice: PracticeQuestion[];
};

export type ExamPaper = {
  id: string;
  exam: ExamType;
  year: number;
  month: number;
  set: number;
  title: string;
  passageIds: string[];
};

export type TextSegment = {
  id: string;
  text: string;
  startIndex: number;
  endIndex: number;
  highlight?: HighlightWord;
};

export type ReviewItem = {
  word: string;
  sentence: string;
  clicked: boolean;
  learned: boolean;
  lastSeen: number;
};

export type LearningWordProgress = {
  seen: boolean;
  correct: number;
  lastSeen: number;
};

export type LearningProgress = {
  words: Record<string, LearningWordProgress>;
};
