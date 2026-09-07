import { Button } from "./Button";

interface DisclosureButtonProps {
  label: string;
  isOpen: boolean;
  onToggle: () => void;
}

export function DisclosureButton({ label, isOpen, onToggle }: DisclosureButtonProps) {
  return (
    <Button
      variant={isOpen ? "disclosureOpen" : "disclosure"}
      size="xs"
      onClick={onToggle}
      aria-expanded={isOpen}
    >
      <span>{label}</span>
      <span aria-hidden="true">{isOpen ? "▼" : "▶"}</span>
    </Button>
  );
}
