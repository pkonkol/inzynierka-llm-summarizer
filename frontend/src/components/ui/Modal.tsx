import { Panel } from "./Panel";

interface ModalProps {
  isOpen: boolean;
  title: string;
  children: React.ReactNode;
  onSubmit?: React.FormEventHandler;
}

export function Modal({ isOpen, title, children, onSubmit }: ModalProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <Panel padding="xl" className="grid w-full max-w-sm gap-6">
        <h2 className="m-0 font-mono text-2xl">{title}</h2>
        {onSubmit ? (
          <form onSubmit={onSubmit} className="grid gap-4">
            {children}
          </form>
        ) : (
          <div className="grid gap-4">{children}</div>
        )}
      </Panel>
    </div>
  );
}
