import fs from "node:fs";
import path from "node:path";

const papersDir = path.join(process.cwd(), "data", "papers");
if (!fs.existsSync(papersDir)) {
  console.error(`[paper-quality-report] directory not found: ${papersDir}`);
  process.exit(1);
}

const files = fs
  .readdirSync(papersDir)
  .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
  .sort();

function hasAnomaly(text) {
  const lower = text.toLowerCase();
  const patterns = [
    "you will hear",
    "questions 9 to",
    "answer sheet 1",
    "directions:",
    "乱码",
    "锟"
  ];
  return patterns.some((p) => lower.includes(p));
}

const details = [];
let totalPassages = 0;
let goodParagraphPassages = 0;
let totalSeeds = 0;
let matchedSeeds = 0;
let anomalous = 0;

for (const file of files) {
  const full = path.join(papersDir, file);
  const data = JSON.parse(fs.readFileSync(full, "utf8"));
  const paperId = data?.paper?.id || file;
  const passages = Array.isArray(data?.passages) ? data.passages : [];
  for (const p of passages) {
    totalPassages += 1;
    const content = String(p.content || "");
    const paraCount = content ? content.split(/\n\s*\n/).filter(Boolean).length : 0;
    const paragraphOk = paraCount >= 3 && paraCount <= 60;
    if (paragraphOk) goodParagraphPassages += 1;

    const seeds = Array.isArray(p.highlightSeeds) ? p.highlightSeeds : [];
    totalSeeds += seeds.length;
    let matched = 0;
    for (const seed of seeds) {
      const s = String(seed.sentence || "").trim();
      if (s && content.includes(s)) matched += 1;
    }
    matchedSeeds += matched;

    const anomaly = hasAnomaly(content);
    if (anomaly) anomalous += 1;

    details.push({
      paperId,
      passageId: p.id,
      section: p.section,
      paragraphCount: paraCount,
      paragraphOk,
      seeds: seeds.length,
      seedMatchRate: seeds.length ? Number((matched / seeds.length).toFixed(4)) : 1,
      anomaly
    });
  }
}

const report = {
  summary: {
    files: files.length,
    passages: totalPassages,
    paragraphIntegrityRate: totalPassages ? Number((goodParagraphPassages / totalPassages).toFixed(4)) : 0,
    highlightSentenceMatchRate: totalSeeds ? Number((matchedSeeds / totalSeeds).toFixed(4)) : 1,
    anomalyRate: totalPassages ? Number((anomalous / totalPassages).toFixed(4)) : 0
  },
  details
};

console.log(JSON.stringify(report, null, 2));

