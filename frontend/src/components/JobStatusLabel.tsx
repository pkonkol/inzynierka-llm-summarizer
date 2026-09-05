import type { JobStatusValue } from "../types/local";

// Glyph as well as colour, so the state survives greyscale and colour-blind vision.
const STATUS_STYLE: Record<JobStatusValue, { className: string; glyph: string }> = {
  completed: { className: "text-success", glyph: "✓" },
  failed: { className: "text-danger", glyph: "✗" },
  pending: { className: "text-warning", glyph: "⋯" },
};

export function JobStatusLabel({ status, count }: { status: JobStatusValue; count?: number }) {
  const { className, glyph } = STATUS_STYLE[status];
  return (
    <span className={className}>
      <span aria-hidden="true">{glyph} </span>
      {count === undefined ? status : `${count} ${status}`}
    </span>
  );
}
