// One frame around the source field and every control that feeds it (DESIGN.md §6 "Kompozytor").
// The field inside has no border of its own; the frame's focus-within state is its focus indicator.
// On a short screen the frame scrolls on its own, so the last child should stay `sticky bottom-0`.
export function Composer({
  source,
  children,
}: {
  source: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-col overflow-y-auto rounded-sm border border-hairline-strong bg-surface-soft focus-within:border-ink focus-within:bg-canvas">
      {source}
      <div className="grid gap-3 border-t border-hairline bg-canvas px-4 pt-3">{children}</div>
    </div>
  );
}
