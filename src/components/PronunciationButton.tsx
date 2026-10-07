import { useEffect, useState } from "react";

type PronunciationButtonProps = {
  onClick: () => void;
  disabled: boolean;
  loading: boolean;
};

export function PronunciationButton({ onClick, disabled, loading }: PronunciationButtonProps) {
  const [cooldown, setCooldown] = useState(false);
  const isDisabled = disabled || cooldown;

  useEffect(() => {
    if (!cooldown) {
      return;
    }
    const timer = window.setTimeout(() => setCooldown(false), 900);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  const handleClick = () => {
    if (isDisabled) {
      return;
    }
    setCooldown(true);
    onClick();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isDisabled}
      className={[
        "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold transition",
        "border border-ink-200 bg-white text-ink-700 active:translate-y-px",
        loading ? "border-accent-300 bg-accent-100/55 text-accent-700" : "",
        isDisabled
          ? "cursor-not-allowed opacity-55"
          : "hover:border-accent-200 hover:bg-accent-100/50 hover:text-accent-700"
      ].join(" ")}
    >
      <span
        className={[
          "h-2.5 w-2.5 rounded-full transition-colors",
          loading ? "animate-pulse bg-accent-500" : "bg-ink-300"
        ].join(" ")}
      />
      <span aria-hidden="true">{loading ? "🔊" : "🔈"}</span>
      {loading ? "Playing..." : cooldown ? "Wait..." : "Pronounce"}
    </button>
  );
}
