// The selectable row shared by the URL list and the jobs list.
const BASE =
  "grid w-full min-w-0 cursor-pointer gap-1 border px-3 py-3 text-left transition-[border-color,background-color] duration-200";

export function listItemClasses(isSelected: boolean): string {
  return isSelected
    ? `${BASE} border-selected-border bg-selected-bg`
    : `${BASE} border-panel-border bg-subtle hover:bg-subtle-hover`;
}
