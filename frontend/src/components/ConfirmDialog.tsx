import { Button } from "./ui/Button";
import { Modal } from "./ui/Modal";

export interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onClose: () => void;
  isConfirming?: boolean;
}

export function ConfirmDialog({
  isOpen,
  title,
  message,
  onConfirm,
  onClose,
  isConfirming = false,
}: ConfirmDialogProps) {
  return (
    <Modal isOpen={isOpen} title={title} onClose={onClose}>
      <p className="text-muted">{message}</p>
      <div className="flex gap-3">
        <Button size="lg" className="flex-1" onClick={onClose} disabled={isConfirming}>
          Anuluj
        </Button>
        <Button
          variant="danger"
          size="lg"
          className="flex-1"
          onClick={onConfirm}
          disabled={isConfirming}
        >
          {isConfirming ? "..." : "Usuń"}
        </Button>
      </div>
    </Modal>
  );
}
