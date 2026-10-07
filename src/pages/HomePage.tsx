import { ChangeEvent, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getAllPapers, getArticleById, getPapersByExam } from "@/data/article";
import { useReviewSystem } from "@/store/useReviewSystem";
import { useUserWords } from "@/store/useUserWords";
import { ExamType } from "@/types";
import { buildApiUrl } from "@/utils/api";
import { UploadedPaperBundle, upsertUploadedPaper } from "@/utils/uploadedPapers";

type ParseResponse = {
  ok: boolean;
  paper: UploadedPaperBundle["paper"];
  passages: UploadedPaperBundle["passages"];
  quality: {
    passageCount: number;
    paragraphIntegrityRate: number;
    avgChars: number;
    anomalyRate: number;
    requiresProofread: boolean;
    warnings: string[];
  };
  requiresProofread: boolean;
};

function formatWarning(code: string) {
  const map: Record<string, string> = {
    no_passages: "未提取到可学习文章，请检查 PDF 质量。",
    low_paragraph_integrity: "段落恢复质量偏低，建议人工校对。",
    short_passages: "提取文本偏短，可能有漏段。",
    text_anomaly_high: "异常文本比例偏高，建议人工校对。"
  };
  return map[code] || code;
}

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("PDF 文件读取失败"));
    reader.onload = () => {
      const result = String(reader.result || "");
      const parts = result.split(",");
      resolve(parts[1] || "");
    };
    reader.readAsDataURL(file);
  });
}

export function HomePage() {
  const navigate = useNavigate();
  const [refreshKey, setRefreshKey] = useState(0);
  const availableExams = useMemo(() => Array.from(new Set(getAllPapers().map((paper) => paper.exam))), [refreshKey]);

  const [selectedExam, setSelectedExam] = useState<ExamType>(() => getAllPapers()[0]?.exam || ("六级" as ExamType));
  const [uploadExam, setUploadExam] = useState<ExamType>(() => getAllPapers()[0]?.exam || ("六级" as ExamType));

  const [uploading, setUploading] = useState(false);
  const [parseError, setParseError] = useState("");
  const [parsedBundle, setParsedBundle] = useState<UploadedPaperBundle | null>(null);
  const [quality, setQuality] = useState<ParseResponse["quality"] | null>(null);
  const [proofreadMode, setProofreadMode] = useState(false);
  const [editingPassages, setEditingPassages] = useState<UploadedPaperBundle["passages"]>([]);

  const { dueCount } = useReviewSystem();
  const { userWordCount } = useUserWords();
  const papers = useMemo(() => getPapersByExam(selectedExam), [selectedExam, refreshKey]);

  const onUploadFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const timeoutController = new AbortController();
    const timeout = window.setTimeout(() => timeoutController.abort(), 120000);

    setParseError("");
    setUploading(true);
    setParsedBundle(null);
    setQuality(null);
    setProofreadMode(false);

    try {
      const fileBase64 = await toBase64(file);

      const response = await fetch(buildApiUrl("/api/parse-pdf"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          fileBase64,
          exam: uploadExam
        }),
        signal: timeoutController.signal
      });

      const data = (await response.json()) as ParseResponse | { error?: string; detail?: string };
      if (!response.ok || !("ok" in data) || !data.ok) {
        const detail = "detail" in data && data.detail ? `（${data.detail}）` : "";
        throw new Error(`PDF 解析失败${detail}`);
      }

      const bundle: UploadedPaperBundle = {
        paper: data.paper,
        passages: data.passages
      };

      upsertUploadedPaper(bundle);

      setParsedBundle(bundle);
      setEditingPassages(bundle.passages);
      setQuality(data.quality);
      setProofreadMode(Boolean(data.requiresProofread));
      setRefreshKey((v) => v + 1);
      setSelectedExam(bundle.paper.exam as ExamType);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setParseError("解析超时（120 秒），请检查后端终端和 Python 环境。");
      } else {
        setParseError(error instanceof Error ? error.message : "PDF 解析失败");
      }
    } finally {
      window.clearTimeout(timeout);
      setUploading(false);
      event.target.value = "";
    }
  };

  const saveProofread = () => {
    if (!parsedBundle) {
      return;
    }
    const nextBundle: UploadedPaperBundle = {
      paper: parsedBundle.paper,
      passages: editingPassages
    };
    upsertUploadedPaper(nextBundle);
    setParsedBundle(nextBundle);
    setProofreadMode(false);
    setRefreshKey((v) => v + 1);
  };

  return (
    <main className="min-h-screen px-4 py-6 md:px-8 md:py-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <section className="rounded-[2rem] border border-[#d4e3d8] bg-gradient-to-b from-[#375a4a] to-[#4d7562] p-6 text-white shadow-soft">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-emerald-100/90">ContextVocab</p>
            <div className="flex items-center gap-2">
              <Link
                to="/wordbook"
                className="rounded-full border border-white/35 bg-white/15 px-3 py-1 text-xs font-semibold text-white hover:bg-white/25"
              >
                词库 {userWordCount}
              </Link>
              <Link
                to="/review"
                className="rounded-full border border-white/35 bg-white/15 px-3 py-1 text-xs font-semibold text-white hover:bg-white/25"
              >
                复习 {dueCount}
              </Link>
            </div>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-white">今天学哪一篇？</h1>
          <p className="mt-2 text-sm text-emerald-50/90">上传 PDF，自动抽取 Section B/C，直接进入阅读点词。</p>
        </section>

        <section className="rounded-2xl border border-ink-200 bg-white/90 p-5 shadow-soft">
          <h2 className="text-base font-semibold text-ink-900">上传 PDF（自动流程）</h2>
          <p className="mt-1 text-sm text-ink-600">主流程自动入库；抽取质量不稳定时，可使用下方人工校对兜底。</p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <select
              value={uploadExam}
              onChange={(e) => setUploadExam(e.target.value as ExamType)}
              className="rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm text-ink-700"
            >
              {availableExams.map((exam) => (
                <option key={exam} value={exam}>
                  {exam}
                </option>
              ))}
            </select>

            <label className="cursor-pointer rounded-xl bg-accent-500 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-700">
              {uploading ? "解析中..." : "上传 PDF"}
              <input type="file" accept=".pdf,application/pdf" className="hidden" onChange={onUploadFile} />
            </label>
          </div>

          {parseError ? (
            <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{parseError}</p>
          ) : null}

          {parsedBundle ? (
            <div className="mt-4 space-y-3 rounded-xl border border-ink-200 bg-ink-50/50 p-4">
              <p className="text-sm font-semibold text-ink-800">已导入：{parsedBundle.paper.title}</p>
              <p className="text-xs text-ink-600">共抽取 {parsedBundle.passages.length} 篇，点击任意文章即可开始学习。</p>

              {quality ? (
                <div className="rounded-xl border border-ink-200 bg-white p-3 text-xs text-ink-600">
                  <p>
                    质量检测：段落完整率 {(quality.paragraphIntegrityRate * 100).toFixed(0)}% 路 异常率{" "}
                    {(quality.anomalyRate * 100).toFixed(0)}%
                  </p>
                  {quality.warnings.length ? (
                    <ul className="mt-2 list-disc space-y-1 pl-4">
                      {quality.warnings.map((code) => (
                        <li key={code}>{formatWarning(code)}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-emerald-700">抽取质量良好，可直接学习。</p>
                  )}
                </div>
              ) : null}

              <div className="grid gap-2 md:grid-cols-2">
                {parsedBundle.passages.map((passage) => (
                  <button
                    key={passage.id}
                    type="button"
                    onClick={() => navigate(`/reading/${passage.id}`)}
                    className="rounded-xl border border-ink-200 bg-white px-3 py-2 text-left text-sm text-ink-700 hover:border-accent-200 hover:bg-accent-100/40"
                  >
                    <p className="text-xs text-accent-700">{passage.section || "阅读文章"}</p>
                    <p className="mt-1 font-semibold">{passage.title}</p>
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setProofreadMode((v) => !v)}
                className="w-fit rounded-xl border border-ink-200 px-3 py-1.5 text-xs font-semibold text-ink-700 hover:bg-ink-100"
              >
                {proofreadMode ? "收起人工校对" : "打开人工校对兜底"}
              </button>
            </div>
          ) : null}
        </section>

        {proofreadMode && parsedBundle ? (
          <section className="rounded-2xl border border-ink-200 bg-white/90 p-5 shadow-soft">
            <h2 className="text-base font-semibold text-ink-900">人工校对兜底</h2>
            <div className="mt-4 space-y-3">
              {editingPassages.map((passage, index) => (
                <div key={passage.id} className="rounded-xl border border-ink-200 bg-ink-50/40 p-3">
                  <p className="mb-2 text-sm font-semibold text-ink-800">
                    {passage.section || `第 ${index + 1} 篇`} 路 {passage.title}
                  </p>
                  <textarea
                    value={passage.content}
                    onChange={(e) => {
                      const next = [...editingPassages];
                      next[index] = { ...next[index], content: e.target.value };
                      setEditingPassages(next);
                    }}
                    className="h-36 w-full resize-y rounded-xl border border-ink-200 bg-white p-3 text-sm leading-7 text-ink-700"
                  />
                </div>
              ))}
            </div>
            <div className="mt-4">
              <button
                type="button"
                onClick={saveProofread}
                className="rounded-xl bg-accent-500 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-700"
              >
                保存校对结果
              </button>
            </div>
          </section>
        ) : null}

        <section className="rounded-2xl border border-ink-200 bg-white/90 p-5 shadow-soft">
          <h2 className="text-base font-semibold text-ink-900">今日复习</h2>
          {dueCount > 0 ? (
            <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-ink-600">你有 {dueCount} 个词待复习。</p>
              <Link
                to="/review"
                className="rounded-xl bg-accent-500 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-700"
              >
                开始复习
              </Link>
            </div>
          ) : (
            <p className="mt-2 text-sm text-ink-600">当前暂无待复习单词。</p>
          )}
        </section>

        <section className="rounded-2xl border border-ink-200 bg-white/90 p-5 shadow-soft">
          <h2 className="text-base font-semibold text-ink-900">我的词库</h2>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink-600">你已加入 {userWordCount} 个词。</p>
            <Link
              to="/wordbook"
              className="rounded-xl border border-ink-200 px-4 py-2 text-sm font-semibold text-ink-700 hover:bg-ink-50"
            >
              管理词库
            </Link>
          </div>
        </section>

        <section className="rounded-2xl border border-ink-200 bg-white/90 p-5 shadow-soft">
          <h2 className="mb-3 text-sm font-semibold text-ink-500">考试类型</h2>
          <div className="flex flex-wrap gap-2">
            {availableExams.map((exam) => (
              <button
                key={exam}
                type="button"
                onClick={() => setSelectedExam(exam)}
                className={[
                  "rounded-full px-4 py-2 text-sm font-semibold transition",
                  selectedExam === exam
                    ? "bg-accent-500 text-white"
                    : "border border-ink-200 bg-white text-ink-700 hover:bg-ink-50"
                ].join(" ")}
              >
                {exam}
              </button>
            ))}
          </div>
        </section>

        {papers.length === 0 ? (
          <section className="rounded-2xl border border-ink-200 bg-white/90 p-5 shadow-soft">
            <p className="text-sm text-ink-600">当前考试类型暂无可学习套题。</p>
          </section>
        ) : (
          <section className="space-y-4">
            {papers.map((paper) => (
              <article key={paper.id} className="rounded-2xl border border-ink-200 bg-white p-5 shadow-soft">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="inline-flex rounded-full bg-accent-100 px-2.5 py-1 text-xs font-semibold text-accent-700">
                      {paper.exam} 路 真题套卷
                    </p>
                    <h3 className="mt-2 text-lg font-semibold text-ink-900">{paper.title}</h3>
                  </div>
                  <p className="text-xs text-ink-500">
                    {paper.year}-{String(paper.month).padStart(2, "0")} 路 第 {paper.set} 套 路 {paper.passageIds.length} 篇
                  </p>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {paper.passageIds.map((passageId) => {
                    const article = getArticleById(passageId);
                    if (!article) {
                      return null;
                    }
                    return (
                      <Link
                        key={article.id}
                        to={`/reading/${article.id}`}
                        className="rounded-xl border border-ink-200 bg-ink-50/60 p-4 transition hover:border-accent-200 hover:bg-accent-100/40"
                      >
                        <p className="text-xs font-semibold text-accent-700">{article.section || "阅读文章"}</p>
                        <p className="mt-1 text-sm font-semibold text-ink-800">{article.title}</p>
                      </Link>
                    );
                  })}
                </div>
              </article>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}
