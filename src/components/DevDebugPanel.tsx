import { useEffect, useMemo, useState } from "react";
import { clearAnalyticsEvents, getAnalyticsEvents, summarizeAnalytics } from "@/utils/analytics";

function pct(v: number) {
  return `${(v * 100).toFixed(1)}%`;
}

type Level = "good" | "warn" | "bad";

function evaluateHigherBetter(value: number, good: number, warn: number): Level {
  if (value >= good) return "good";
  if (value >= warn) return "warn";
  return "bad";
}

function evaluateLowerBetter(value: number, good: number, warn: number): Level {
  if (value <= good) return "good";
  if (value <= warn) return "warn";
  return "bad";
}

function levelClass(level: Level) {
  if (level === "good") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (level === "warn") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-rose-200 bg-rose-50 text-rose-700";
}

function metricCard(label: string, value: string, level: Level) {
  return (
    <div className={`rounded-lg border p-2 text-xs ${levelClass(level)}`}>
      <p className="font-semibold">{label}</p>
      <p className="mt-1">{value}</p>
    </div>
  );
}

export function DevDebugPanel() {
  const [open, setOpen] = useState(false);
  const [version, setVersion] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => setVersion((v) => v + 1), 1500);
    const onStorage = () => setVersion((v) => v + 1);
    window.addEventListener("storage", onStorage);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const events = useMemo(() => getAnalyticsEvents(), [version]);
  const summary = useMemo(() => summarizeAnalytics(events), [events]);
  const sourceEntries = useMemo(
    () => Object.entries(summary.sourceBreakdown).sort((a, b) => b[1] - a[1]),
    [summary.sourceBreakdown]
  );
  const topErrors = useMemo(
    () => Object.entries(summary.errorBreakdown).sort((a, b) => b[1] - a[1]).slice(0, 5),
    [summary.errorBreakdown]
  );

  const tech = useMemo(
    () => ({
      apiSuccess: evaluateHigherBetter(summary.successRate, 0.8, 0.65),
      fallback: evaluateLowerBetter(summary.fallbackRate, 0.2, 0.35),
      timeout: evaluateLowerBetter(summary.timeoutRate, 0.25, 0.45),
      under3s: evaluateHigherBetter(summary.under3sRate, 0.85, 0.7)
    }),
    [summary]
  );
  const content = useMemo(
    () => ({
      wrongMeaning: evaluateLowerBetter(summary.wrongMeaningRate, 0.12, 0.22),
      cnReadable: evaluateHigherBetter(summary.chineseReadableRate, 0.8, 0.6),
      correction: evaluateLowerBetter(summary.userCorrectionRate, 0.2, 0.35)
    }),
    [summary]
  );
  const learning = useMemo(
    () => ({
      known: evaluateHigherBetter(summary.knownRate, 0.6, 0.4),
      d1Review: evaluateHigherBetter(summary.nextDayReviewCompletionRate, 0.6, 0.4),
      d1Retention: evaluateHigherBetter(summary.nextDayRetentionRate, 0.35, 0.2),
      addRate: evaluateHigherBetter(summary.wordbookAddRate, 0.15, 0.08)
    }),
    [summary]
  );

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(events, null, 2));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="fixed bottom-3 right-3 z-50">
      {open ? (
        <div className="w-[360px] max-h-[82vh] overflow-auto rounded-2xl border border-ink-200 bg-white p-3 shadow-soft">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-600">Dev Metrics</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full border border-ink-200 px-2 py-0.5 text-xs text-ink-600"
            >
              Hide
            </button>
          </div>

          <div className="mb-2 rounded-lg bg-ink-50 p-2 text-xs text-ink-700">
            事件 {summary.events} · 点击 {summary.wordClicks} · 返回 {summary.cardResponses} · 错误 {summary.cardErrors}
          </div>

          <p className="mb-1 text-[11px] font-semibold text-ink-600">技术层（稳定性）</p>
          <div className="grid grid-cols-2 gap-2">
            {metricCard("API成功率", pct(summary.successRate), tech.apiSuccess)}
            {metricCard("Fallback率", pct(summary.fallbackRate), tech.fallback)}
            {metricCard("超时率", pct(summary.timeoutRate), tech.timeout)}
            {metricCard("3秒出卡率", pct(summary.under3sRate), tech.under3s)}
          </div>

          <p className="mb-1 mt-3 text-[11px] font-semibold text-ink-600">内容层（解释质量）</p>
          <div className="grid grid-cols-2 gap-2">
            {metricCard("错义率", pct(summary.wrongMeaningRate), content.wrongMeaning)}
            {metricCard("中文可读率", pct(summary.chineseReadableRate), content.cnReadable)}
            {metricCard("用户纠错率", pct(summary.userCorrectionRate), content.correction)}
            {metricCard("词典命中率", pct(summary.dictionaryRate), evaluateHigherBetter(summary.dictionaryRate, 0.3, 0.15))}
          </div>

          <p className="mb-1 mt-3 text-[11px] font-semibold text-ink-600">学习层（闭环效果）</p>
          <div className="grid grid-cols-2 gap-2">
            {metricCard("复习“我会”比例", pct(summary.knownRate), learning.known)}
            {metricCard("D1复习完成率", pct(summary.nextDayReviewCompletionRate), learning.d1Review)}
            {metricCard("次日留存率", pct(summary.nextDayRetentionRate), learning.d1Retention)}
            {metricCard("词库加入率", pct(summary.wordbookAddRate), learning.addRate)}
          </div>

          <p className="mb-1 mt-3 text-[11px] font-semibold text-ink-600">来源拆分</p>
          <div className="rounded-lg border border-ink-200 bg-ink-50 p-2 text-[11px] text-ink-600">
            {sourceEntries.length === 0 ? (
              <p>暂无数据</p>
            ) : (
              sourceEntries.map(([source, ratio]) => (
                <p key={source} className="mt-1 first:mt-0">
                  {source}: {pct(ratio)}
                </p>
              ))
            )}
          </div>

          <p className="mb-1 mt-3 text-[11px] font-semibold text-ink-600">错误拆分</p>
          <div className="rounded-lg border border-ink-200 bg-ink-50 p-2 text-[11px] text-ink-600">
            {topErrors.length === 0 ? (
              <p>暂无错误</p>
            ) : (
              topErrors.map(([code, count]) => (
                <p key={code} className="mt-1 first:mt-0">
                  {code}: {count}
                </p>
              ))
            )}
          </div>

          <p className="mt-3 text-[10px] text-ink-400">
            目标阈值：API≥80% · 3秒≥85% · fallback≤20% · 错义≤12% · D1复习≥60%
          </p>

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="rounded-lg border border-ink-200 px-2 py-1 text-xs font-semibold text-ink-700"
            >
              {copied ? "Copied" : "Copy Events"}
            </button>
            <button
              type="button"
              onClick={() => {
                clearAnalyticsEvents();
                setVersion((v) => v + 1);
              }}
              className="rounded-lg border border-rose-200 px-2 py-1 text-xs font-semibold text-rose-700"
            >
              Clear
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-full border border-ink-200 bg-white px-3 py-1.5 text-xs font-semibold text-ink-700 shadow-soft"
        >
          Dev Panel
        </button>
      )}
    </div>
  );
}
