import fs from "node:fs";
import path from "node:path";

const input = process.argv[2] || path.join(process.cwd(), "data", "analytics-events.json");
if (!fs.existsSync(input)) {
  console.error(`[analytics-report] input file not found: ${input}`);
  console.error("Export from browser localStorage key: contextvocab_analytics_events_v1");
  process.exit(1);
}

/** @type {{event:string;ts:number;payload:Record<string,any>}[]} */
const events = JSON.parse(fs.readFileSync(input, "utf8"));

const byEvent = (name) => events.filter((e) => e.event === name);

const wordClicks = byEvent("word_click");
const cardResponses = byEvent("card_response");
const cardErrors = byEvent("card_error");
const reviewSubmits = byEvent("review_submit");

const within3s = cardResponses.filter((e) => e.payload.within3s === true).length;
const fallbackCount = cardResponses.filter((e) => e.payload.source === "fallback").length;
const successCount = cardResponses.filter((e) => e.payload.success === true).length;

// recovery: an error followed by non-fallback response for same word within 10s
let recovered = 0;
for (const err of cardErrors) {
  const word = err.payload.word;
  const found = cardResponses.find(
    (r) =>
      r.payload.word === word &&
      r.ts >= err.ts &&
      r.ts - err.ts <= 10000 &&
      r.payload.source !== "fallback"
  );
  if (found) recovered += 1;
}

const knownCount = reviewSubmits.filter((e) => e.payload.known === true).length;
const report = {
  totals: {
    events: events.length,
    wordClicks: wordClicks.length,
    cardResponses: cardResponses.length,
    cardErrors: cardErrors.length,
    reviewSubmits: reviewSubmits.length
  },
  funnel: {
    cardResponseRate: wordClicks.length ? Number((cardResponses.length / wordClicks.length).toFixed(4)) : 0
  },
  quality: {
    under3sRate: cardResponses.length ? Number((within3s / cardResponses.length).toFixed(4)) : 0,
    fallbackRate: cardResponses.length ? Number((fallbackCount / cardResponses.length).toFixed(4)) : 0,
    successRate: cardResponses.length ? Number((successCount / cardResponses.length).toFixed(4)) : 0,
    apiRecoveryRate: cardErrors.length ? Number((recovered / cardErrors.length).toFixed(4)) : 0
  },
  learning: {
    knownRate: reviewSubmits.length ? Number((knownCount / reviewSubmits.length).toFixed(4)) : 0
  }
};

console.log(JSON.stringify(report, null, 2));

