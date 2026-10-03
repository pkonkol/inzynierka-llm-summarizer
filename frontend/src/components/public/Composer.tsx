// One frame around the source field and every control that feeds it (DESIGN.md §6 "Kompozytor").
// The field inside has no border of its own; the frame's focus-within state is its focus indicator.
export function Composer({
  source,
  children,
}: {
  source: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-col rounded-sm border border-hairline-strong bg-surface-soft focus-within:border-ink focus-within:bg-canvas">
      {source}
      <div className="grid gap-3 border-t border-hairline bg-canvas px-4 pt-3 pb-4">{children}</div>
    </div>
  );
}
