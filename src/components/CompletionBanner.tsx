type CompletionBannerProps = {
  exploredCount: number;
  totalCount: number;
  onStartPractice: () => void;
};

export function CompletionBanner({ exploredCount, totalCount, onStartPractice }: CompletionBannerProps) {
  return (
    <div className="fixed bottom-4 left-1/2 z-20 w-[min(96%,760px)] -translate-x-1/2 rounded-2xl border border-accent-200 bg-white p-3 shadow-soft">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-ink-700">
          已完成本篇学习（{exploredCount}/{totalCount}），来试试记住了吗？
        </p>
        <button
          type="button"
          onClick={onStartPractice}
          className="rounded-xl bg-accent-500 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-700"
        >
          开始练习
        </button>
      </div>
    </div>
  );
}
