type ComparisonBlockProps = {
  baseWord: string;
  baseMeaning: string;
  targetWord: string;
  targetMeaning: string;
};

export function ComparisonBlock({
  baseWord,
  baseMeaning,
  targetWord,
  targetMeaning
}: ComparisonBlockProps) {
  return (
    <div className="rounded-xl border border-ink-200 bg-white p-3">
      <h5 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-500">词义对比</h5>
      <div className="space-y-2">
        <div className="rounded-lg bg-ink-50 px-2.5 py-2 text-sm text-ink-700">
          <span className="font-semibold text-ink-900">{baseWord}</span>
          <span className="mx-1 text-ink-400">:</span>
          <span>{baseMeaning}</span>
        </div>
        <div className="rounded-lg border border-accent-200 bg-accent-100/45 px-2.5 py-2 text-sm text-ink-700">
          <span className="font-semibold text-accent-700">{targetWord}</span>
          <span className="mx-1 text-accent-400">:</span>
          <span>{targetMeaning}</span>
        </div>
      </div>
    </div>
  );
}
