import { cn } from "./cn";

// The strip that lays out cells sized to their own text: a border around the group, 1px gaps
// between cells showing the same colour behind them — same construction as NavDock's outer
// border. NavDock builds its own nested grid instead, since its cells stretch to fill fixed
// columns; this variant is for a strip that should stay left-aligned and compact.
export const SEGMENTED_STRIP_INLINE =
  "inline-flex gap-px border border-panel-border bg-panel-border";

// Width is left to the caller (className): "w-full" to stretch inside a grid track, nothing to
// size to the cell's own text.
export function segmentedCellClasses(isActive: boolean, className?: string): string {
  return cn(
    "flex items-center justify-center whitespace-nowrap px-3 py-2 font-mono uppercase transition-colors duration-150 sm:px-5",
    isActive ? "bg-ink text-panel-solid" : "bg-panel-solid text-ink hover:bg-subtle-hover",
    className,
  );
}
