import { useMemo, useState } from "react";
import { PracticeQuestion } from "@/types";

type PracticeModalProps = {
  questions: PracticeQuestion[];
  onClose: () => void;
  onComplete: (result: { correct: number; total: number; wordResults: Record<string, boolean> }) => void;
};

type JudgedMap = Record<string, { isCorrect: boolean }>;

function normalize(text: string) {
  return text.trim().toLowerCase();
}

export function PracticeModal({ questions, onClose, onComplete }: PracticeModalProps) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [judged, setJudged] = useState<JudgedMap>({});

  const current = questions[index];
  const currentAnswer = answers[current.id] ?? "";
  const currentJudged = judged[current.id];
  const allDone = useMemo(() => Object.keys(judged).length === questions.length, [judged, questions.length]);
  const isLastQuestion = index === questions.length - 1;

  const judgeQuestion = (question: PracticeQuestion, answer: string) => {
    const isCorrect = normalize(answer) === normalize(question.answer);
    setJudged((prev) => ({ ...prev, [question.id]: { isCorrect } }));
  };

  const handleSubmit = () => {
    const result = questions.reduce(
      (acc, question) => {
        const isCorrect = judged[question.id]?.isCorrect ?? false;
        acc.total += 1;
        acc.correct += isCorrect ? 1 : 0;
        acc.wordResults[question.wordId] = isCorrect;
        return acc;
      },
      { correct: 0, total: 0, wordResults: {} as Record<string, boolean> }
    );
    onComplete(result);
  };

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/30 p-4 md:items-center">
      <div className="ui-card w-full max-w-xl p-5 md:p-6">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-ink-900">语境练习</h3>
          <button
            type="button"
            onClick={onClose}
            className="ui-pill px-2.5 py-1 text-xs font-semibold text-ink-600 hover:bg-ink-100"
          >
            关闭
          </button>
        </div>

        <div className="space-y-4">
          <p className="text-xs font-semibold text-ink-500">
            第 {index + 1} / {questions.length} 题
          </p>
          <p className="rounded-xl bg-ink-50 p-3 text-sm leading-6 text-ink-800">{current.prompt}</p>

          {current.type === "fill_blank" ? (
            <div className="space-y-2">
              <input
                value={currentAnswer}
                onChange={(e) => {
                  setAnswers((prev) => ({ ...prev, [current.id]: e.target.value }));
                  if (currentJudged) {
                    setJudged((prev) => {
                      const { [current.id]: _removed, ...rest } = prev;
                      return rest;
                    });
                  }
                }}
                placeholder="输入单词"
                className="w-full rounded-xl border border-ink-200 px-3 py-2 text-sm outline-none focus:border-accent-200"
              />
              <button
                type="button"
                onClick={() => judgeQuestion(current, currentAnswer)}
                disabled={!currentAnswer.trim() || Boolean(currentJudged)}
                className="ui-pill px-3 py-1.5 text-sm font-semibold text-ink-700 disabled:opacity-40"
              >
                判题
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {current.options.map((option) => (
                <button
                  type="button"
                  key={option}
                  onClick={() => {
                    setAnswers((prev) => ({ ...prev, [current.id]: option }));
                    judgeQuestion(current, option);
                  }}
                  className={[
                    "block w-full rounded-xl border px-3 py-2 text-left text-sm transition",
                    currentAnswer === option
                      ? "border-accent-300 bg-accent-100/60 text-accent-700"
                      : "border-ink-200 hover:bg-ink-50"
                  ].join(" ")}
                >
                  {option}
                </button>
              ))}
            </div>
          )}

          {currentJudged ? (
            <div
              className={[
                "rounded-xl border p-3 text-sm",
                currentJudged.isCorrect
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-rose-200 bg-rose-50 text-rose-700"
              ].join(" ")}
            >
              <p className="font-semibold">{currentJudged.isCorrect ? "回答正确" : "回答错误"}</p>
              <p className="mt-1">正确答案：{current.answer}</p>
              <p className="mt-1 text-xs">
                解释：{current.explanation || "回到原句看语境强度与语气，再记这个词在句中的角色。"}
              </p>
            </div>
          ) : null}

          <div className="flex justify-end">
            {isLastQuestion ? (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!allDone || !currentJudged}
                className="ui-btn-primary rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-40"
              >
                完成并查看结果
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIndex((prev) => Math.min(prev + 1, questions.length - 1))}
                disabled={!currentJudged}
                className="ui-btn-primary rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-40"
              >
                下一题
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
