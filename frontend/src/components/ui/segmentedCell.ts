import { cn } from "./cn";

// Width is left to the caller (className): "w-full" to stretch inside a grid track, nothing to
// size to the cell's own text.
export function segmentedCellClasses(isActive: boolean, className?: string): string {
  return cn(
    "flex items-center justify-center whitespace-nowrap px-3 py-2 font-mono uppercase transition-colors duration-150 sm:px-5",
    isActive ? "bg-ink text-panel-solid" : "bg-panel-solid text-ink hover:bg-subtle-hover",
    className,
  );
}
