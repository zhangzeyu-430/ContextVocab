import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useUserWords } from "@/store/useUserWords";
import { DictionaryMeaning, fetchDictionaryMeaning } from "@/utils/dictionaryCache";
import { trackEvent } from "@/utils/analytics";

type MeaningState = {
  loading: boolean;
  data?: DictionaryMeaning;
};

function sourceLabel(source?: DictionaryMeaning["source"]) {
  if (source === "cache") return "缓存";
  if (source === "free_dictionary") return "免费词典";
  if (source === "fallback") return "兜底";
  return "未知";
}

function escapeCsv(value: string) {
  const clean = String(value || "");
  if (/[",\n]/.test(clean)) {
    return `"${clean.replace(/"/g, "\"\"")}"`;
  }
  return clean;
}

function toLocalTime(ts: number) {
  return new Date(ts).toLocaleString();
}

function dateStamp() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function downloadTextFile(filename: string, text: string, mimeType: string) {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function WordbookPage() {
  const { userWords, userWordCount, removeUserWord } = useUserWords();
  const [query, setQuery] = useState("");
  const [meaningMap, setMeaningMap] = useState<Record<string, MeaningState>>({});
  const [exporting, setExporting] = useState<"" | "csv" | "md">("");

  const words = useMemo(() => Object.values(userWords).sort((a, b) => b.lastSeen - a.lastSeen), [userWords]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return words;
    return words.filter((item) => item.word.toLowerCase().includes(q));
  }, [words, query]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      for (const item of words) {
        const key = item.word.trim().toLowerCase();
        if (meaningMap[key]?.data || meaningMap[key]?.loading) {
          // eslint-disable-next-line no-continue
          continue;
        }
        if (!alive) return;
        setMeaningMap((prev) => ({ ...prev, [key]: { loading: true } }));
        // eslint-disable-next-line no-await-in-loop
        const data = await fetchDictionaryMeaning(item.word);
        if (!alive) return;
        setMeaningMap((prev) => ({ ...prev, [key]: { loading: false, data } }));
      }
    };
    load();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [words]);

  const ensureMeanings = async () => {
    const collected: Record<string, DictionaryMeaning> = {};
    for (const item of filtered) {
      const key = item.word.trim().toLowerCase();
      const current = meaningMap[key]?.data;
      if (current) {
        collected[key] = current;
        // eslint-disable-next-line no-continue
        continue;
      }

      setMeaningMap((prev) => ({ ...prev, [key]: { loading: true } }));
      // eslint-disable-next-line no-await-in-loop
      const fetched = await fetchDictionaryMeaning(item.word);
      collected[key] = fetched;
      setMeaningMap((prev) => ({ ...prev, [key]: { loading: false, data: fetched } }));
    }
    return collected;
  };

  const handleExportCsv = async () => {
    setExporting("csv");
    try {
      const meanings = await ensureMeanings();
      const lines = [
        "word,part_of_speech,definition,example,source,sentence,last_seen",
        ...filtered.map((item) => {
          const key = item.word.trim().toLowerCase();
          const m = meanings[key] || meaningMap[key]?.data;
          return [
            escapeCsv(item.word),
            escapeCsv(m?.partOfSpeech || "word"),
            escapeCsv(m?.definition || ""),
            escapeCsv(m?.example || ""),
            escapeCsv(sourceLabel(m?.source)),
            escapeCsv(item.sentence),
            escapeCsv(toLocalTime(item.lastSeen))
          ].join(",");
        })
      ];
      downloadTextFile(`contextvocab-wordbook-${dateStamp()}.csv`, lines.join("\n"), "text/csv;charset=utf-8");
    } finally {
      setExporting("");
    }
  };

  const handleExportMarkdown = async () => {
    setExporting("md");
    try {
      const meanings = await ensureMeanings();
      const blocks = [`# ContextVocab 词库 (${dateStamp()})`, "", `总词数：${filtered.length}`, ""];

      filtered.forEach((item, index) => {
        const key = item.word.trim().toLowerCase();
        const m = meanings[key] || meaningMap[key]?.data;
        blocks.push(`## ${index + 1}. ${item.word}`);
        blocks.push(`- 词性：${m?.partOfSpeech || "word"}`);
        blocks.push(`- 词典释义：${m?.definition || "N/A"}`);
        blocks.push(`- 来源：${sourceLabel(m?.source)}`);
        if (m?.example) {
          blocks.push(`- 例句：${m.example}`);
        }
        blocks.push(`- 最近学习：${toLocalTime(item.lastSeen)}`);
        blocks.push("> 语境句子");
        blocks.push(`> ${item.sentence}`);
        blocks.push("");
      });

      downloadTextFile(`contextvocab-wordbook-${dateStamp()}.md`, blocks.join("\n"), "text/markdown;charset=utf-8");
    } finally {
      setExporting("");
    }
  };

  return (
    <main className="min-h-screen px-4 py-6 md:px-8 md:py-8">
      <div className="mx-auto max-w-5xl space-y-5">
        <section className="rounded-2xl border border-ink-200 bg-white/90 p-6 shadow-soft">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-500">词库</p>
            <div className="flex items-center gap-2">
              <Link
                to="/review"
                className="rounded-full border border-ink-200 bg-white px-3 py-1 text-xs font-semibold text-ink-700 hover:bg-ink-50"
              >
                复习
              </Link>
              <Link
                to="/"
                className="rounded-full border border-ink-200 bg-white px-3 py-1 text-xs font-semibold text-ink-700 hover:bg-ink-50"
              >
                首页
              </Link>
            </div>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-ink-900">我的单词表</h1>
          <p className="mt-2 text-sm text-ink-600">当前共 {userWordCount} 个手动加入词。</p>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索单词..."
              className="min-w-[220px] flex-1 rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm text-ink-700"
            />
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={exporting !== "" || filtered.length === 0}
              className="rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm font-semibold text-ink-700 hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {exporting === "csv" ? "导出中..." : "导出 CSV"}
            </button>
            <button
              type="button"
              onClick={handleExportMarkdown}
              disabled={exporting !== "" || filtered.length === 0}
              className="rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm font-semibold text-ink-700 hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {exporting === "md" ? "导出中..." : "导出 Markdown"}
            </button>
          </div>
        </section>

        {filtered.length === 0 ? (
          <section className="rounded-2xl border border-ink-200 bg-white/90 p-5 shadow-soft">
            <p className="text-sm text-ink-600">你的词库还没有单词。</p>
          </section>
        ) : (
          <section className="space-y-3">
            {filtered.map((item) => {
              const key = item.word.trim().toLowerCase();
              const meaning = meaningMap[key];
              return (
                <article key={`${key}-${item.lastSeen}`} className="rounded-2xl border border-ink-200 bg-white p-4 shadow-soft">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-xl font-semibold text-ink-900">{item.word}</h3>
                      <p className="mt-1 text-xs text-ink-500">最近学习：{new Date(item.lastSeen).toLocaleString()}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        removeUserWord(item.word);
                        trackEvent("wordbook_remove", {
                          word: item.word
                        });
                      }}
                      className="rounded-full border border-red-200 px-3 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                    >
                      移除
                    </button>
                  </div>

                  <p className="mt-3 rounded-xl border border-accent-200 bg-accent-100/40 p-3 text-sm text-ink-700">"{item.sentence}"</p>

                  <div className="mt-3 rounded-xl border border-ink-200 bg-ink-50/50 p-3">
                    <p className="text-xs font-semibold text-ink-500">词典标准释义</p>
                    {meaning?.loading ? (
                      <p className="mt-1 text-sm text-ink-600">释义加载中...</p>
                    ) : (
                      <>
                        <p className="mt-1 text-sm text-ink-700">{meaning?.data?.definition || "暂无释义"}</p>
                        <p className="mt-1 text-xs text-ink-500">
                          {meaning?.data?.partOfSpeech || "word"} 路 来源：{sourceLabel(meaning?.data?.source)}
                        </p>
                        {meaning?.data?.example ? <p className="mt-1 text-xs text-ink-500">例句：{meaning.data.example}</p> : null}
                      </>
                    )}
                  </div>
                </article>
              );
            })}
          </section>
        )}
      </div>
    </main>
  );
}
