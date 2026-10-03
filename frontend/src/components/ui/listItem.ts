// The selectable row shared by the URL list and the jobs list; the <li> around it carries the hairline.
const BASE = "grid w-full min-w-0 cursor-pointer gap-1 px-2 py-2 text-left no-underline";

export function listItemClasses(isSelected: boolean): string {
  return isSelected ? `${BASE} bg-surface-card` : BASE;
}
