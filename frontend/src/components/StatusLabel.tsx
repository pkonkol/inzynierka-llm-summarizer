import type { JobStatus } from "../types/local";

// Jobs, evaluation runs and run entries all report the same four values.
// Glyph as well as colour, so the state survives greyscale and colour-blind vision.
// The counted form is adjectival ("4 gotowe") so one label works with and without a number.
const STATUS_STYLE: Record<JobStatus, { className: string; glyph: string; label: string }> = {
  completed: { className: "text-ink", glyph: "[✓]", label: "gotowe" },
  failed: { className: "text-danger-hover", glyph: "[✗]", label: "błędne" },
  pending: { className: "text-mute", glyph: "[⋯]", label: "w kolejce" },
  running: { className: "text-warning-active", glyph: "[▶]", label: "w toku" },
};

export function StatusLabel({ status, count }: { status: JobStatus; count?: number }) {
  const { className, glyph, label } = STATUS_STYLE[status];
  return (
    <span className={className}>
      <span aria-hidden="true">{glyph} </span>
      {count === undefined ? label : `${count} ${label}`}
    </span>
  );
}
