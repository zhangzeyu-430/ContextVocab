import { useMemo } from "react";
import { tokenizeContent, TextToken } from "@/utils/textParsing";

type ReadingArticleProps = {
  title: string;
  content: string;
  selectedWord: string | null;
  selectedSentenceRange: { startIndex: number; endIndex: number } | null;
  clickedWords: Set<string>;
  onClickWord: (token: TextToken) => void;
};

export function ReadingArticle({
  title,
  content,
  selectedWord,
  selectedSentenceRange,
  clickedWords,
  onClickWord
}: ReadingArticleProps) {
  const tokens = useMemo(() => tokenizeContent(content), [content]);

  const inSelectedSentence = (start: number, end: number) => {
    if (!selectedSentenceRange) {
      return false;
    }
    return start < selectedSentenceRange.endIndex && end > selectedSentenceRange.startIndex;
  };

  return (
    <section className="ui-card p-6 md:p-8">
      <h2 className="mb-5 text-xl font-semibold tracking-tight text-ink-900">{title}</h2>
      <article className="max-w-none whitespace-pre-wrap text-[1.04rem] leading-8 text-ink-700">
        {tokens.map((token) => {
          const sentenceFocus = inSelectedSentence(token.startIndex, token.endIndex);

          if (!token.isWord) {
            return (
              <span
                key={token.id}
                className={
                  sentenceFocus
                    ? "rounded-[0.32rem] bg-accent-100/35 px-[1px] py-[1px] transition-colors duration-300"
                    : ""
                }
              >
                {token.text}
              </span>
            );
          }

          const isClicked = token.normalized ? clickedWords.has(token.normalized) : false;
          const isActive = selectedWord ? token.normalized === selectedWord.toLowerCase() : false;

          return (
            <span
              key={token.id}
              className={
                sentenceFocus
                  ? "rounded-[0.32rem] bg-accent-100/35 px-[1px] py-[1px] transition-colors duration-300"
                  : ""
              }
            >
              <button
                type="button"
                onClick={() => onClickWord(token)}
                className={[
                  "inline rounded-[0.36rem] px-1 transition-all duration-200",
                  "cursor-pointer border-b hover:-translate-y-[1px] hover:bg-accent-100/70",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-200",
                  isClicked
                    ? "border-emerald-200 bg-emerald-50/80 text-emerald-800"
                    : "border-ink-200/30 text-ink-900",
                  isActive ? "border-accent-500 bg-accent-100 text-accent-700" : ""
                ].join(" ")}
              >
                {token.text}
              </button>
            </span>
          );
        })}
      </article>
    </section>
  );
}
