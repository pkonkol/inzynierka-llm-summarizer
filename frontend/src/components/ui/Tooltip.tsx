import type { ReactNode } from "react";

interface TooltipProps {
  /** Also goes on the child's `aria-describedby`, so the description has one id and one owner. */
  id: string;
  description: string;
  children: ReactNode;
}

// CSS only. `:focus-visible` skips a mouse click, so a clicked link leaves no bubble hanging,
// and Tab still reaches the description. The focus sits on the child, hence `group-has-*`.
export function Tooltip({ id, description, children }: TooltipProps) {
  return (
    <span className="group relative inline-flex">
      {children}
      <span
        id={id}
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-full z-50 hidden w-64 max-w-[90vw] -translate-x-1/2 translate-y-1 border border-panel-border bg-panel-solid px-3 py-2 text-xs normal-case leading-relaxed tracking-normal text-ink shadow-lg group-has-[:focus-visible]:block group-hover:block"
      >
        {description}
      </span>
    </span>
  );
}
