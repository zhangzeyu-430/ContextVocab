import { HighlightWord, TextSegment } from "@/types";

export function buildTextSegments(content: string, highlights: HighlightWord[]): TextSegment[] {
  const sortedHighlights = [...highlights].sort((a, b) => a.startIndex - b.startIndex);
  const segments: TextSegment[] = [];
  let cursor = 0;

  sortedHighlights.forEach((highlight, index) => {
    if (highlight.startIndex < cursor) {
      return;
    }

    if (cursor < highlight.startIndex) {
      segments.push({
        id: `plain-${index}-${cursor}`,
        text: content.slice(cursor, highlight.startIndex),
        startIndex: cursor,
        endIndex: highlight.startIndex
      });
    }

    segments.push({
      id: `hl-${highlight.id}-${highlight.startIndex}`,
      text: content.slice(highlight.startIndex, highlight.endIndex),
      startIndex: highlight.startIndex,
      endIndex: highlight.endIndex,
      highlight
    });

    cursor = highlight.endIndex;
  });

  if (cursor < content.length) {
    segments.push({
      id: `plain-tail-${cursor}`,
      text: content.slice(cursor),
      startIndex: cursor,
      endIndex: content.length
    });
  }

  return segments;
}
