export type TextToken = {
  id: string;
  text: string;
  isWord: boolean;
  startIndex: number;
  endIndex: number;
  normalized?: string;
};

export type SentenceRange = {
  text: string;
  startIndex: number;
  endIndex: number;
};

const TOKEN_REGEX = /([A-Za-z]+(?:'[A-Za-z]+)?|\s+|[^A-Za-z\s]+)/g;

export function tokenizeContent(content: string): TextToken[] {
  const tokens: TextToken[] = [];
  let match: RegExpExecArray | null;
  let idx = 0;

  while ((match = TOKEN_REGEX.exec(content)) !== null) {
    const value = match[0];
    const startIndex = match.index;
    const endIndex = startIndex + value.length;
    const isWord = /^[A-Za-z]+(?:'[A-Za-z]+)?$/.test(value);

    tokens.push({
      id: `tk-${idx}-${startIndex}`,
      text: value,
      isWord,
      startIndex,
      endIndex,
      normalized: isWord ? value.toLowerCase() : undefined
    });
    idx += 1;
  }

  return tokens;
}

export function splitSentencesWithRange(content: string): SentenceRange[] {
  const ranges: SentenceRange[] = [];
  const regex = /[^.!?]+[.!?]?/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    const raw = match[0];
    const trimmed = raw.trim();
    if (!trimmed) {
      continue;
    }
    const trimStartOffset = raw.indexOf(trimmed);
    const startIndex = match.index + trimStartOffset;
    const endIndex = startIndex + trimmed.length;
    ranges.push({ text: trimmed, startIndex, endIndex });
  }

  return ranges;
}

export function findSentenceByPosition(
  sentences: SentenceRange[],
  wordStartIndex: number
): SentenceRange | null {
  const found = sentences.find(
    (sentence) => wordStartIndex >= sentence.startIndex && wordStartIndex < sentence.endIndex
  );
  return found ?? null;
}
