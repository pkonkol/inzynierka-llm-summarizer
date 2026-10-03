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
      <p className="wrap-anywhere text-body">{message}</p>
      <div className="flex justify-end gap-2">
        <Button onClick={onClose} disabled={isConfirming}>
          Anuluj
        </Button>
        <Button variant="primary" onClick={onConfirm} disabled={isConfirming}>
          {isConfirming ? "..." : "Usuń"}
        </Button>
      </div>
    </Modal>
  );
}
