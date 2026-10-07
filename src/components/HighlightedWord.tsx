import { HighlightWord } from "@/types";

type HighlightedWordProps = {
  highlight: HighlightWord;
  active: boolean;
  explored: boolean;
  onClick: (word: HighlightWord) => void;
};

export function HighlightedWord({ highlight, active, explored, onClick }: HighlightedWordProps) {
  return (
    <button
      type="button"
      onClick={() => onClick(highlight)}
      className={[
        "relative inline rounded-[0.36rem] px-1 transition-all duration-200",
        "cursor-pointer border-b hover:-translate-y-[1px] hover:scale-[1.02]",
        explored
          ? "border-emerald-200 bg-emerald-50/80 text-emerald-800 hover:bg-emerald-100/80"
          : "border-accent-200 bg-accent-100/60 text-ink-900 hover:bg-accent-100",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-200",
        active
          ? "border-accent-500 bg-accent-100 text-accent-700 shadow-[inset_0_-1px_0_rgba(180,138,29,0.5)]"
          : ""
      ].join(" ")}
    >
      {highlight.word}
    </button>
  );
}
