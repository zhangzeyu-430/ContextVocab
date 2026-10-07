import http from "node:http";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { config as loadEnv } from "dotenv";

loadEnv();

const PORT = Number(process.env.PORT || 8787);
const OPENROUTER_API_KEY =
  process.env.OPENROUTER_API_KEY ||
  process.env.VITE_OPENROUTER_API_KEY ||
  (process.env.VITE_GEMINI_API_KEY?.startsWith("sk-or-v1")
    ? process.env.VITE_GEMINI_API_KEY
    : "") ||
  "";
const OPENROUTER_MODEL =
  process.env.OPENROUTER_MODEL ||
  process.env.VITE_OPENROUTER_MODEL ||
  "openrouter/auto";
const OPENROUTER_FALLBACK_MODEL =
  process.env.OPENROUTER_FALLBACK_MODEL || "openrouter/auto";
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const OPENROUTER_TOTAL_TIMEOUT_MS = Number(process.env.OPENROUTER_TOTAL_TIMEOUT_MS || 9500);

/** @type {Map<string, { card: any; sentence: string; updatedAt: number }>} */
const memoryCache = new Map();
/** @type {Map<string, Promise<{ card: any | null; errorCode: string | null }>>} */
const inFlightWordRequests = new Map();

function normalizeWord(word) {
  return String(word || "").trim().toLowerCase();
}

function fallbackCard(word) {
  return {
    meaning: `${word} means something context-specific in this sentence.`,
    reasoning: "Infer the meaning from the sentence role and tone.",
    contrast: {
      baseWord: "basic word",
      baseMeaning: "general meaning",
      targetWord: word,
      targetMeaning: "more context-specific meaning"
    },
    analogy: `Think of ${word} as a situational expression, not a fixed translation.`,
    synonyms: ["related", "similar"],
    mistake: "Do not memorize only the literal translation.",
    oneLiner: `${word}: understand the sentence first.`,
    meta: {
      isOfflineFallback: true
    }
  };
}

function normalizeCard(word, payload) {
  return {
    meaning: payload?.meaning || `${word} should be interpreted in context.`,
    reasoning: payload?.reasoning || `${word} adds a more precise meaning in this sentence.`,
    contrast: {
      baseWord: payload?.contrast?.baseWord || "basic word",
      baseMeaning: payload?.contrast?.baseMeaning || "more neutral meaning",
      targetWord: payload?.contrast?.targetWord || word,
      targetMeaning: payload?.contrast?.targetMeaning || "more context-specific meaning"
    },
    analogy: payload?.analogy || `Treat ${word} like a context-bound expression.`,
    synonyms:
      Array.isArray(payload?.synonyms) && payload.synonyms.length
        ? payload.synonyms.slice(0, 3)
        : ["related", "similar"],
    mistake: payload?.mistake || `Avoid learning ${word} as an isolated translation.`,
    oneLiner: payload?.oneLiner || `${word}: context first, memory second.`,
    meta: {
      isOfflineFallback: false
    }
  };
}

function extractJson(text) {
  const cleaned = String(text || "").trim();
  if (!cleaned) {
    return null;
  }
  try {
    return JSON.parse(cleaned);
  } catch {
    const first = cleaned.indexOf("{");
    const last = cleaned.lastIndexOf("}");
    if (first >= 0 && last > first) {
      try {
        return JSON.parse(cleaned.slice(first, last + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function getPrompt(word, sentence) {
  return `
You are an English learning memory-card assistant.
Return JSON only.

word: ${word}
sentence: ${sentence}

JSON schema:
{
  "meaning": "meaning in this sentence",
  "reasoning": "why this word fits here",
  "contrast": {
    "baseWord": "simpler expression",
    "baseMeaning": "meaning of simpler expression",
    "targetWord": "${word}",
    "targetMeaning": "more accurate meaning here"
  },
  "analogy": "easy real-life analogy in Chinese",
  "synonyms": ["synonym1", "synonym2"],
  "mistake": "a common misuse warning",
  "oneLiner": "short memorable hook in Chinese"
}
`;
}

function readJsonBody(req, maxBytes = 1_000_000) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > maxBytes) {
        reject(new Error("Payload too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  res.end(JSON.stringify(data));
}

function getMemoryCache(word) {
  const key = normalizeWord(word);
  const item = memoryCache.get(key);
  if (!item) {
    return null;
  }
  if (Date.now() - item.updatedAt > CACHE_TTL_MS) {
    memoryCache.delete(key);
    return null;
  }
  return item;
}

function setMemoryCache(word, sentence, card) {
  const key = normalizeWord(word);
  const value = {
    sentence,
    card,
    updatedAt: Date.now()
  };
  memoryCache.set(key, value);
  return value;
}

async function fetchFromOpenRouter(word, sentence) {
  if (!OPENROUTER_API_KEY) {
    return {
      payload: null,
      errorCode: "missing_api_key"
    };
  }

  const prompt = getPrompt(word, sentence);
  const baseBody = {
    messages: [
      {
        role: "system",
        content: "Return JSON object only."
      },
      {
        role: "user",
        content: prompt
      }
    ],
    temperature: 0.3
  };

  async function request(model, useJsonResponseFormat, timeoutMs) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort("timeout"), timeoutMs);
    const body = useJsonResponseFormat
      ? { ...baseBody, model, response_format: { type: "json_object" } }
      : { ...baseBody, model };

    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          "HTTP-Referer": "http://localhost",
          "X-Title": "ContextVocab Server"
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        return { ok: false, status: response.status, errText };
      }

      const data = await response.json();
      const text = data?.choices?.[0]?.message?.content;
      if (!text || typeof text !== "string") {
        return { ok: false, status: 200, errText: "empty_content" };
      }

      const parsed = extractJson(text);
      if (!parsed) {
        return { ok: false, status: 200, errText: "invalid_json_content" };
      }

      return { ok: true, payload: parsed };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return { ok: false, status: 408, errText: "timeout" };
      }
      return { ok: false, status: 500, errText: "network_error" };
    } finally {
      clearTimeout(timeout);
    }
  }

  const startedAt = Date.now();
  const remaining = () => OPENROUTER_TOTAL_TIMEOUT_MS - (Date.now() - startedAt);

  if (remaining() <= 1200) {
    return {
      payload: null,
      errorCode: "budget_exhausted"
    };
  }

  const firstTimeout = Math.max(1600, Math.min(6500, remaining() - 1200));
  const firstTry = await request(OPENROUTER_MODEL, true, firstTimeout);
  if (firstTry.ok) {
    return {
      payload: firstTry.payload,
      errorCode: null
    };
  }

  if (firstTry.status === 405 && remaining() > 1000) {
    const secondTimeout = Math.max(1000, Math.min(3200, remaining() - 800));
    const secondTry = await request(OPENROUTER_MODEL, false, secondTimeout);
    if (secondTry.ok) {
      return {
        payload: secondTry.payload,
        errorCode: null
      };
    }

    if (remaining() <= 900) {
      console.warn("[server] OpenRouter retry(no response_format) error", secondTry.status, secondTry.errText);
      return {
        payload: null,
        errorCode: `openrouter_${secondTry.status}_${secondTry.errText}`
      };
    }

    const thirdTimeout = Math.max(900, remaining() - 200);
    const thirdTry = await request(OPENROUTER_FALLBACK_MODEL, false, thirdTimeout);
    if (thirdTry.ok) {
      return {
        payload: thirdTry.payload,
        errorCode: null
      };
    }

    console.warn("[server] OpenRouter retry(no response_format) error", secondTry.status, secondTry.errText);
    console.warn("[server] OpenRouter fallback model error", thirdTry.status, thirdTry.errText);
    return {
      payload: null,
      errorCode: `openrouter_${thirdTry.status}_${thirdTry.errText}`
    };
  }

  if (remaining() <= 900) {
    console.warn("[server] OpenRouter error", firstTry.status, firstTry.errText);
    return {
      payload: null,
      errorCode: `openrouter_${firstTry.status}_${firstTry.errText}`
    };
  }

  const fallbackTimeout = Math.max(900, Math.min(2600, remaining() - 200));
  const fallbackTry = await request(OPENROUTER_FALLBACK_MODEL, false, fallbackTimeout);
  if (fallbackTry.ok) {
    return {
      payload: fallbackTry.payload,
      errorCode: null
    };
  }

  console.warn("[server] OpenRouter error", firstTry.status, firstTry.errText);
  console.warn("[server] OpenRouter fallback model error", fallbackTry.status, fallbackTry.errText);
  return {
    payload: null,
    errorCode: `openrouter_${fallbackTry.status}_${fallbackTry.errText}`
  };
}

async function resolveCard(word, sentence) {
  const normalized = normalizeWord(word);
  const cacheHit = getMemoryCache(normalized);
  if (cacheHit) {
    return {
      card: cacheHit.card,
      errorCode: null
    };
  }

  const existing = inFlightWordRequests.get(normalized);
  if (existing) {
    return existing;
  }

  const task = (async () => {
    const { payload, errorCode } = await fetchFromOpenRouter(word, sentence);
    if (!payload) {
      return {
        card: null,
        errorCode: errorCode || "provider_failed"
      };
    }
    const card = normalizeCard(word, payload);
    setMemoryCache(word, sentence, card);
    return {
      card,
      errorCode: null
    };
  })().finally(() => {
    inFlightWordRequests.delete(normalized);
  });

  inFlightWordRequests.set(normalized, task);
  return task;
}

function slugify(input) {
  return String(input || "")
    .toLowerCase()
    .replace(/\.pdf$/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function analyzePaperQuality(bundle) {
  const passages = Array.isArray(bundle?.passages) ? bundle.passages : [];
  if (passages.length === 0) {
    return {
      passageCount: 0,
      paragraphIntegrityRate: 0,
      avgChars: 0,
      anomalyRate: 1,
      requiresProofread: true,
      warnings: ["no_passages"]
    };
  }

  const chars = passages.map((p) => (p.content || "").length);
  const avgChars = Math.round(chars.reduce((a, b) => a + b, 0) / passages.length);
  const paragraphGood = passages.filter((p) => (p.content || "").split(/\n\n+/).filter(Boolean).length >= 2).length;
  const paragraphIntegrityRate = paragraphGood / passages.length;
  const anomalyHit = passages.filter((p) => /(?:\uFFFD|�|\s{6,}|A\.)/.test(p.content || "")).length;
  const anomalyRate = anomalyHit / passages.length;

  const warnings = [];
  if (paragraphIntegrityRate < 0.7) warnings.push("low_paragraph_integrity");
  if (avgChars < 700) warnings.push("short_passages");
  if (anomalyRate > 0.34) warnings.push("text_anomaly_high");

  return {
    passageCount: passages.length,
    paragraphIntegrityRate: Number(paragraphIntegrityRate.toFixed(4)),
    avgChars,
    anomalyRate: Number(anomalyRate.toFixed(4)),
    requiresProofread: warnings.length > 0,
    warnings
  };
}

async function runPdfToPaper({ filePath, exam, year, month, setNo, paperId }) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "contextvocab-parse-"));
  const outPath = path.join(tempDir, `${paperId}.json`);
  const scriptPath = path.join(process.cwd(), "scripts", "pdf_to_paper.py");

  const args = [
    scriptPath,
    "--pdf",
    filePath,
    "--paper-id",
    paperId,
    "--exam",
    exam,
    "--year",
    String(year),
    "--month",
    String(month),
    "--set",
    String(setNo),
    "--out",
    outPath
  ];

  const runOnce = (bin, binArgs) =>
    new Promise((resolve) => {
      const proc = spawn(bin, [...binArgs, ...args], { stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      const timer = setTimeout(() => {
        proc.kill();
        resolve({ ok: false, stdout, stderr: `${stderr}\nparse_timeout` });
      }, 90_000);

      proc.stdout.on("data", (d) => {
        stdout += d.toString();
      });
      proc.stderr.on("data", (d) => {
        stderr += d.toString();
      });
      proc.on("error", (err) => {
        clearTimeout(timer);
        resolve({ ok: false, stdout, stderr: `${stderr}\nspawn_error:${String(err)}` });
      });
      proc.on("close", (code) => {
        clearTimeout(timer);
        if (code === 0) {
          resolve({ ok: true, stdout, stderr });
        } else {
          resolve({ ok: false, stdout, stderr: `${stderr}\nexit_${code}` });
        }
      });
    });

  const candidates = [
    ["python", []],
    ["py", ["-3"]],
    ["py", []]
  ];

  let result = null;
  for (const [bin, binArgs] of candidates) {
    // eslint-disable-next-line no-await-in-loop
    const current = await runOnce(bin, binArgs);
    if (current.ok) {
      result = current;
      break;
    }
    result = current;
  }

  if (!result || !result.ok) {
    throw new Error(`pdf_parse_failed:${result.stderr || "unknown"}`);
  }

  const raw = await fs.readFile(outPath, "utf-8");
  const json = JSON.parse(raw);

  await fs.rm(tempDir, { recursive: true, force: true });
  return json;
}

const server = http.createServer(async (req, res) => {
  if (!req.url) {
    sendJson(res, 404, { error: "Not found" });
    return;
  }

  if (req.method === "OPTIONS") {
    sendJson(res, 204, {});
    return;
  }

  if (req.url === "/api/health" && req.method === "GET") {
    sendJson(res, 200, {
      ok: true,
      cacheSize: memoryCache.size,
      inFlight: inFlightWordRequests.size,
      hasOpenRouterKey: Boolean(OPENROUTER_API_KEY),
      model: OPENROUTER_MODEL,
      fallbackModel: OPENROUTER_FALLBACK_MODEL,
      totalTimeoutMs: OPENROUTER_TOTAL_TIMEOUT_MS
    });
    return;
  }

  if (req.url === "/api/parse-pdf" && req.method === "POST") {
    try {
      const body = await readJsonBody(req, 40_000_000);
      const fileName = String(body.fileName || "uploaded.pdf");
      const fileBase64 = String(body.fileBase64 || "").trim();
      const exam = String(body.exam || "六级");
      const now = new Date();
      const year = Number(body.year || now.getFullYear());
      const month = Number(body.month || Math.max(1, Math.min(12, now.getMonth() + 1)));
      const setNo = Number(body.setNo || 1);
      const safeName = slugify(fileName) || `upload-${Date.now()}`;
      const paperId = String(body.paperId || `${safeName}-${Date.now()}`);

      if (!fileBase64) {
        sendJson(res, 400, { error: "fileBase64 is required" });
        return;
      }

      const pdfBuffer = Buffer.from(fileBase64, "base64");
      if (pdfBuffer.length < 100) {
        sendJson(res, 400, { error: "invalid_pdf_data" });
        return;
      }

      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "contextvocab-upload-"));
      const pdfPath = path.join(tempDir, fileName.toLowerCase().endsWith(".pdf") ? fileName : `${safeName}.pdf`);
      await fs.writeFile(pdfPath, pdfBuffer);

      let parsed;
      try {
        parsed = await runPdfToPaper({
          filePath: pdfPath,
          exam,
          year,
          month,
          setNo,
          paperId
        });
      } finally {
        await fs.rm(tempDir, { recursive: true, force: true });
      }

      const quality = analyzePaperQuality(parsed);

      sendJson(res, 200, {
        ok: true,
        paper: parsed.paper,
        passages: parsed.passages,
        quality,
        requiresProofread: quality.requiresProofread
      });
      return;
    } catch (error) {
      console.error("[server] /api/parse-pdf error:", error);
      sendJson(res, 500, {
        error: "pdf_parse_failed",
        detail: error instanceof Error ? error.message : String(error)
      });
      return;
    }
  }

  if (req.url !== "/api/card" || req.method !== "POST") {
    sendJson(res, 404, { error: "Not found" });
    return;
  }

  try {
    const startedAt = Date.now();
    const body = await readJsonBody(req);
    const word = String(body.word || "").trim();
    const sentence = String(body.sentence || "").trim();

    if (!word || !sentence) {
      sendJson(res, 400, { error: "word and sentence are required" });
      return;
    }

    const cacheHit = getMemoryCache(word);
    if (cacheHit) {
      sendJson(res, 200, {
        source: "server_cache",
        latencyMs: Date.now() - startedAt,
        card: cacheHit.card
      });
      return;
    }

    const result = await resolveCard(word, sentence);
    if (result?.card) {
      sendJson(res, 200, {
        source: "openrouter",
        latencyMs: Date.now() - startedAt,
        card: result.card
      });
      return;
    }

    const fallback = fallbackCard(word);
    sendJson(res, 200, {
      source: "fallback",
      latencyMs: Date.now() - startedAt,
      errorCode: result?.errorCode || "provider_failed",
      card: fallback
    });
  } catch (error) {
    console.error("[server] /api/card error:", error);
    sendJson(res, 500, {
      error: "internal_error"
    });
  }
});

server.listen(PORT, () => {
  console.log(`[contextvocab-server] listening on http://localhost:${PORT}`);
});
