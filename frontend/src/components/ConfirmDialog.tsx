interface ConfirmDialogProps {
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    onClose: () => void;
    isConfirming?: boolean;
}

export function ConfirmDialog({ isOpen, title, message, onConfirm, onClose, isConfirming = false }: ConfirmDialogProps) {
    if (!isOpen) {
        return null;
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="w-full max-w-sm border border-panel-border bg-panel-bg p-8 shadow-panel">
                <h2 className="mb-5 font-display text-2xl">{title}</h2>
                <p className="mb-4 text-sm text-muted">{message}</p>
                <div className="flex gap-3">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isConfirming}
                        className="h-12 flex-1 cursor-pointer border border-panel-border bg-panel-solid text-ink transition-[opacity] duration-200 hover:enabled:opacity-90 disabled:opacity-65"
                    >
                        Anuluj
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        disabled={isConfirming}
                        className="h-12 flex-1 cursor-pointer border border-danger bg-danger font-display text-accent-50 transition-[opacity] duration-200 hover:enabled:opacity-90 disabled:cursor-wait disabled:opacity-65"
                    >
                        {isConfirming ? "..." : "Usuń"}
                    </button>
                </div>
            </div>
        </div>
    );
}
