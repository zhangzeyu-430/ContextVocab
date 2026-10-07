import { Link } from "react-router-dom";

type HeaderProps = {
  title: string;
  subtitle: string;
  modeLabel: string;
  level: string;
  category: string;
  exploredCount: number;
  totalCount: number;
  showReviewEntry?: boolean;
  showWordbookEntry?: boolean;
};

export function Header({
  title,
  subtitle,
  modeLabel,
  level,
  category,
  exploredCount,
  totalCount,
  showReviewEntry = true,
  showWordbookEntry = true
}: HeaderProps) {
  return (
    <header className="ui-card p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <p className="ui-pill inline-flex items-center px-3 py-1 text-xs font-semibold text-ink-700">
            {modeLabel}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-900 md:text-3xl">{title}</h1>
          <p className="text-sm text-ink-500 md:text-base">{subtitle}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {showReviewEntry ? (
            <Link
              to="/review"
              className="ui-pill px-3 py-1 text-xs font-semibold text-ink-700 transition hover:bg-ink-100"
            >
              复习
            </Link>
          ) : null}
          {showWordbookEntry ? (
            <Link
              to="/wordbook"
              className="ui-pill px-3 py-1 text-xs font-semibold text-ink-700 transition hover:bg-ink-100"
            >
              词库
            </Link>
          ) : null}
          <span className="rounded-full bg-accent-100 px-3 py-1 text-xs font-semibold text-accent-700">{category}</span>
          <span className="rounded-full bg-ink-100 px-3 py-1 text-xs font-semibold text-ink-700">{level}</span>
          <span className="ui-pill px-3 py-1 text-xs font-semibold text-ink-700">
            <span key={exploredCount} className="inline-block animate-count-pop text-accent-700">
              {exploredCount}
            </span>{" "}
            / {totalCount} 个词已点读
          </span>
        </div>
      </div>
    </header>
  );
}
