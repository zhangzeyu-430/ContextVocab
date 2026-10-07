export function EmptyCardHint() {
  return (
    <aside className="animate-fade-in rounded-2xl border border-dashed border-ink-300 bg-white/90 p-6 text-ink-600 shadow-soft">
      <p className="mb-2 inline-flex items-center gap-1 rounded-full bg-ink-100 px-3 py-1 text-xs font-semibold text-ink-700">
        <span aria-hidden="true">✨</span>
        Memory Card
      </p>
      <h3 className="mb-2 text-lg font-semibold text-ink-900">点击左侧高亮词，查看语境记忆卡</h3>
      <p className="text-sm leading-6">
        在句子里理解词义，再通过对比和记忆钩子把它记牢，而不是背孤立翻译。
      </p>
    </aside>
  );
}
