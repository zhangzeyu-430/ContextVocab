import { MemoryWord } from "@/types";
import { ComparisonBlock } from "./ComparisonBlock";
import { PronunciationButton } from "./PronunciationButton";
import { SectionBlock } from "./SectionBlock";

type MemoryCardProps = {
  word: MemoryWord;
  onClose: () => void;
  onPronounce: (word: string) => void;
  onAddToWordbook: (word: MemoryWord) => void;
  onCardFeedback?: (word: MemoryWord, accurate: boolean) => void;
  isInWordbook: boolean;
  addDisabled?: boolean;
  pronunciationDisabled: boolean;
  isPlaying: boolean;
  pronunciationMessage: string | null;
  loading?: boolean;
};

function sourceLabel(source?: string) {
  if (source === "local_cache") return "Local Cache";
  if (source === "function_word_hint") return "Function-word Hint";
  if (source === "free_dictionary") return "Free Dictionary";
  if (source === "local_lexicon") return "Local Lexicon";
  if (source === "server_cache") return "Server Cache";
  if (source === "openrouter") return "OpenRouter";
  if (source === "fallback") return "Fallback";
  return "Unknown";
}

export function MemoryCard({
  word,
  onClose,
  onPronounce,
  onAddToWordbook,
  onCardFeedback,
  isInWordbook,
  addDisabled = false,
  pronunciationDisabled,
  isPlaying,
  pronunciationMessage,
  loading = false
}: MemoryCardProps) {
  const isFunctionWordHint = word.card.meta?.source === "function_word_hint";

  return (
    <aside className="ui-card animate-fade-in rounded-3xl p-5 md:p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="space-y-1.5">
          <p className="inline-flex rounded-full bg-accent-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-accent-700">
            Context Memory Card
          </p>
          <h3 className="text-2xl font-semibold tracking-tight text-ink-900">{word.word}</h3>
          <p className="text-sm text-ink-500">
            {word.ipa || "N/A"} / {word.partOfSpeech || "Unknown"}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="ui-pill px-2.5 py-1.5 text-xs font-semibold text-ink-500 transition hover:bg-ink-100 hover:text-ink-700"
        >
          Close
        </button>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        <span className="rounded-full border border-ink-200 bg-ink-50 px-2 py-0.5 text-[11px] font-medium text-ink-600">
          Source: {sourceLabel(word.card.meta?.source)}
        </span>
        <span className="rounded-full border border-ink-200 bg-ink-50 px-2 py-0.5 text-[11px] font-medium text-ink-600">
          Latency: {word.card.meta?.latencyMs ?? 0} ms
        </span>
      </div>

      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => onCardFeedback?.(word, true)}
          className="ui-pill bg-white px-2.5 py-1 text-[11px] font-semibold text-ink-600 hover:bg-ink-100"
        >
          解释准确
        </button>
        <button
          type="button"
          onClick={() => onCardFeedback?.(word, false)}
          className="ui-pill bg-white px-2.5 py-1 text-[11px] font-semibold text-ink-600 hover:bg-ink-100"
        >
          解释不准
        </button>
      </div>

      <div className="mb-4 animate-fade-in rounded-2xl border border-accent-200 bg-accent-100/65 px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-accent-700">One-liner Hook</p>
        <p className="mt-1.5 text-lg font-semibold leading-7 text-ink-900">
          {loading ? "Generating memory card..." : `👉 ${word.card.oneLiner || "Understand the sentence first."}`}
        </p>
      </div>

      {word.card.meta?.isOfflineFallback ? (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
          ⚠ Simplified explanation (offline fallback)
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => onAddToWordbook(word)}
          disabled={addDisabled || isInWordbook}
          className={[
            "rounded-full border px-4 py-2 text-sm font-semibold transition",
            isInWordbook
              ? "cursor-default border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-accent-200 bg-accent-100/60 text-accent-700 hover:bg-accent-100",
            addDisabled ? "cursor-not-allowed opacity-60" : ""
          ].join(" ")}
        >
          {isInWordbook ? "已加入词库" : "加入词库"}
        </button>

        {isInWordbook ? <span className="text-xs text-emerald-700">已保存，可去词库查看</span> : null}

        <PronunciationButton
          onClick={() => onPronounce(word.word)}
          disabled={pronunciationDisabled || loading}
          loading={isPlaying}
        />
        {pronunciationMessage ? <span className="text-xs text-amber-600">{pronunciationMessage}</span> : null}
      </div>

      <blockquote className="mb-4 rounded-xl border border-accent-200 bg-accent-100/45 p-3 text-sm leading-6 text-ink-700">
        "{word.sentence}"
      </blockquote>

      <div className="max-h-[58vh] space-y-3.5 overflow-y-auto pr-1">
        {isFunctionWordHint ? (
          <SectionBlock title="Quick Tip">
            <p>{word.card.meaning || "This word is usually functional. Prioritize content words first."}</p>
            <p className="mt-2 text-xs text-ink-500">{word.card.reasoning}</p>
          </SectionBlock>
        ) : (
          <>
            <SectionBlock title="Context Meaning">
              <p>{loading ? "Analyzing context..." : word.card.meaning || "N/A"}</p>
            </SectionBlock>

            <SectionBlock title="Why this word here">
              <p>{loading ? "Generating reasoning..." : word.card.reasoning || "N/A"}</p>
              <div className="pt-2">
                <ComparisonBlock
                  baseWord={word.card.contrast?.baseWord || "basic word"}
                  baseMeaning={word.card.contrast?.baseMeaning || "generic expression"}
                  targetWord={word.card.contrast?.targetWord || word.word}
                  targetMeaning={word.card.contrast?.targetMeaning || "more context-specific"}
                />
              </div>
            </SectionBlock>

            <SectionBlock title="Analogy">
              <p>{loading ? "Generating analogy..." : word.card.analogy || "N/A"}</p>
            </SectionBlock>

            <SectionBlock title="Synonyms in scenario">
              <div className="flex flex-wrap gap-2">
                {(word.card.synonyms?.length ? word.card.synonyms : ["N/A"]).map((item) => (
                  <span
                    key={item}
                    className="rounded-full border border-ink-200 bg-white px-2.5 py-1 text-xs font-medium text-ink-600 transition hover:-translate-y-[1px] hover:border-accent-200 hover:bg-accent-100/45 hover:text-accent-700"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </SectionBlock>

            <SectionBlock title="Common mistake">
              <p>{loading ? "Generating tips..." : word.card.mistake || "N/A"}</p>
            </SectionBlock>
          </>
        )}
      </div>
    </aside>
  );
}
