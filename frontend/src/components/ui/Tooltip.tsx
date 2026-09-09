import type { ReactNode } from "react";
import { useId } from "react";

interface TooltipProps {
  description: string;
  /** Receives the bubble's id, which the trigger must carry as `aria-describedby`. */
  children: (describedBy: string) => ReactNode;
}

// CSS only. `:focus-visible` skips a mouse click, so a clicked link leaves no bubble hanging,
// and Tab still reaches the description. The focus sits on the child, hence `group-has-*`.
export function Tooltip({ description, children }: TooltipProps) {
  const describedBy = useId();

  return (
    <span className="group relative inline-flex">
      {children(describedBy)}
      <span
        id={describedBy}
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-full z-50 hidden w-64 max-w-[90vw] -translate-x-1/2 translate-y-1 border border-panel-border bg-panel-solid px-3 py-2 text-xs normal-case leading-relaxed tracking-normal text-ink shadow-lg group-has-[:focus-visible]:block group-hover:block"
      >
        {description}
      </span>
    </span>
  );
}
