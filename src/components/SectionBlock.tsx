import { ReactNode } from "react";

type SectionBlockProps = {
  title: string;
  children: ReactNode;
};

export function SectionBlock({ title, children }: SectionBlockProps) {
  return (
    <section className="space-y-2.5 rounded-xl border border-ink-100 bg-ink-50/60 p-3.5">
      <h4 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">{title}</h4>
      <div className="text-sm leading-6 text-ink-700">{children}</div>
    </section>
  );
}
