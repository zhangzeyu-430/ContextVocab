export const ANALYTICS_STORAGE_KEY = "contextvocab_analytics_events_v1";
const SESSION_KEY = "contextvocab_session_id_v1";

export type AnalyticsEvent = {
  event: string;
  ts: number;
  sessionId: string;
  payload: Record<string, unknown>;
};

export type AnalyticsSummary = {
  events: number;
  wordClicks: number;
  cardResponses: number;
  cardErrors: number;
  reviewSubmits: number;
  wordbookAdds: number;
  wordbookRemoves: number;
  cardFeedbacks: number;
  under3sRate: number;
  fallbackRate: number;
  successRate: number;
  finalSuccessRate: number;
  timeoutRate: number;
  apiRecoveryRate: number;
  cnCoverageRate: number;
  chineseReadableRate: number;
  wrongMeaningRate: number;
  userCorrectionRate: number;
  dictionaryRate: number;
  wordbookAddRate: number;
  knownRate: number;
  nextDayReviewCompletionRate: number;
  nextDayRetentionRate: number;
  sourceBreakdown: Record<string, number>;
  errorBreakdown: Record<string, number>;
};

function getSessionId() {
  if (typeof window === "undefined") {
    return "server";
  }
  const existing = window.localStorage.getItem(SESSION_KEY);
  if (existing) {
    return existing;
  }
  const created = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  window.localStorage.setItem(SESSION_KEY, created);
  return created;
}

function readEvents(): AnalyticsEvent[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(ANALYTICS_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AnalyticsEvent[]) : [];
  } catch {
    return [];
  }
}

function writeEvents(events: AnalyticsEvent[]) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(ANALYTICS_STORAGE_KEY, JSON.stringify(events));
}

function dayKey(ts: number) {
  const d = new Date(ts);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function addDays(key: string, n: number) {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + n);
  return dayKey(date.getTime());
}

function rate(n: number, d: number) {
  return d > 0 ? Number((n / d).toFixed(4)) : 0;
}

export function trackEvent(event: string, payload: Record<string, unknown> = {}) {
  const entry: AnalyticsEvent = {
    event,
    ts: Date.now(),
    sessionId: getSessionId(),
    payload
  };
  const events = readEvents();
  events.push(entry);
  if (events.length > 5000) {
    events.splice(0, events.length - 5000);
  }
  writeEvents(events);
}

export function getAnalyticsEvents() {
  return readEvents();
}

export function clearAnalyticsEvents() {
  writeEvents([]);
}

export function summarizeAnalytics(events: AnalyticsEvent[]): AnalyticsSummary {
  const wordClicks = events.filter((e) => e.event === "word_click");
  const cardResponses = events.filter((e) => e.event === "card_response");
  const cardErrors = events.filter((e) => e.event === "card_error");
  const autoRecoveries = events.filter((e) => e.event === "card_auto_recover");
  const reviewSubmits = events.filter((e) => e.event === "review_submit");
  const reviewSessionCompletes = events.filter((e) => e.event === "review_session_complete");
  const wordbookAdds = events.filter((e) => e.event === "wordbook_add");
  const wordbookRemoves = events.filter((e) => e.event === "wordbook_remove");
  const cardFeedbacks = events.filter((e) => e.event === "card_feedback");

  const within3s = cardResponses.filter((e) => e.payload.within3s === true).length;
  const fallbackCount = cardResponses.filter((e) => e.payload.source === "fallback").length;
  const successCount = cardResponses.filter((e) => e.payload.success === true).length;
  const chineseCount = cardResponses.filter((e) => e.payload.hasChinese === true).length;
  const dictionaryCount = cardResponses.filter((e) => e.payload.source === "free_dictionary").length;
  const timeoutCount = cardErrors.filter((e) => String(e.payload.errorCode || "").toLowerCase().includes("timeout")).length;

  let recovered = 0;
  for (const err of cardErrors) {
    const word = err.payload.word;
    const found = cardResponses.find(
      (r) =>
        r.payload.word === word &&
        r.ts >= err.ts &&
        r.ts - err.ts <= 12000 &&
        r.payload.source !== "fallback"
    );
    if (found) {
      recovered += 1;
    }
  }

  let recoveredFallbackCount = 0;
  for (const res of cardResponses) {
    if (res.payload.source !== "fallback") continue;
    const word = res.payload.word;
    const paperId = res.payload.paperId;
    const articleId = res.payload.articleId;
    const found = autoRecoveries.find(
      (r) =>
        r.payload.word === word &&
        r.payload.paperId === paperId &&
        r.payload.articleId === articleId &&
        r.ts >= res.ts &&
        r.ts - res.ts <= 20000
    );
    if (found) recoveredFallbackCount += 1;
  }

  const knownCount = reviewSubmits.filter((e) => e.payload.known === true).length;
  const nextDayDueTotal = reviewSessionCompletes.reduce((acc, item) => {
    const due = Number(item.payload.nextDayDueCount || 0);
    return acc + (Number.isFinite(due) ? due : 0);
  }, 0);
  const nextDayCompletedTotal = reviewSessionCompletes.reduce((acc, item) => {
    const done = Number(item.payload.nextDayCompletedCount || 0);
    return acc + (Number.isFinite(done) ? done : 0);
  }, 0);

  const sourceBreakdownCount = cardResponses.reduce<Record<string, number>>((acc, item) => {
    const key = String(item.payload.source || "unknown");
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const sourceBreakdown = Object.entries(sourceBreakdownCount).reduce<Record<string, number>>((acc, [key, count]) => {
    acc[key] = rate(count, cardResponses.length);
    return acc;
  }, {});
  const errorBreakdown = cardErrors.reduce<Record<string, number>>((acc, item) => {
    const key = String(item.payload.errorCode || "unknown");
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const accurateFeedbackCount = cardFeedbacks.filter((e) => e.payload.accurate === true).length;
  const wrongFeedbackCount = cardFeedbacks.filter((e) => e.payload.accurate === false).length;
  const correctionCount = wordbookRemoves.length + wrongFeedbackCount;

  const activeDays = new Set(events.map((e) => dayKey(e.ts)));
  const dayPairs = Array.from(activeDays).filter((d) => activeDays.has(addDays(d, 1))).length;
  const nextDayRetentionRate = rate(dayPairs, activeDays.size);

  return {
    events: events.length,
    wordClicks: wordClicks.length,
    cardResponses: cardResponses.length,
    cardErrors: cardErrors.length,
    reviewSubmits: reviewSubmits.length,
    wordbookAdds: wordbookAdds.length,
    wordbookRemoves: wordbookRemoves.length,
    cardFeedbacks: cardFeedbacks.length,
    under3sRate: rate(within3s, cardResponses.length),
    fallbackRate: rate(fallbackCount, cardResponses.length),
    successRate: rate(successCount, cardResponses.length),
    finalSuccessRate: rate(successCount + recoveredFallbackCount, cardResponses.length),
    timeoutRate: rate(timeoutCount, cardErrors.length),
    apiRecoveryRate: rate(recovered, cardErrors.length),
    cnCoverageRate: rate(chineseCount, cardResponses.length),
    chineseReadableRate: rate(chineseCount, cardResponses.length),
    wrongMeaningRate: rate(wrongFeedbackCount, cardFeedbacks.length),
    userCorrectionRate: rate(correctionCount, wordClicks.length),
    dictionaryRate: rate(dictionaryCount, cardResponses.length),
    wordbookAddRate: rate(wordbookAdds.length, wordClicks.length),
    knownRate: rate(knownCount, reviewSubmits.length),
    nextDayReviewCompletionRate: rate(nextDayCompletedTotal, nextDayDueTotal),
    nextDayRetentionRate,
    sourceBreakdown,
    errorBreakdown
  };
}
