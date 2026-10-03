import { cn } from "./cn";

interface DisclosureButtonProps {
  label: string;
  isOpen: boolean;
  onToggle: () => void;
  className?: string;
}

export function DisclosureButton({ label, isOpen, onToggle, className }: DisclosureButtonProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={isOpen}
      className={cn("flex min-h-11 cursor-pointer items-center gap-2 text-left", className)}
    >
      <span aria-hidden="true">{isOpen ? "[-]" : "[+]"}</span>
      {label}
    </button>
  );
}
