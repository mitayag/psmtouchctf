import { useCallback, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { Button } from './Button';
import './Modal.css';

interface ModalProps {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  actions?: ReactNode;
}

export function Modal({ open, title, children, onClose, actions }: ModalProps) {
  const ref = useRef<HTMLDivElement>(null);
  const openRef = useRef(false);

  useEffect(() => {
    if (open && !openRef.current) {
      openRef.current = true;
      const previouslyFocused = document.activeElement as HTMLElement | null;
      requestAnimationFrame(() => {
        ref.current?.focus();
      });
      return () => {
        previouslyFocused?.focus();
      };
    }
    if (!open) {
      openRef.current = false;
    }
  }, [open]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, handleKeyDown]);

  if (!open) return null;

  return (
    <div className="ctf-modal-backdrop" onClick={onClose} role="presentation">
      <div
        ref={ref}
        className="ctf-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="modal-title" className="ctf-modal-title">
          {title}
        </h2>
        <div className="ctf-modal-body">{children}</div>
        {actions && <div className="ctf-modal-actions">{actions}</div>}
        {!actions && (
          <div className="ctf-modal-actions">
            <Button onClick={onClose}>Close</Button>
          </div>
        )}
      </div>
    </div>
  );
}

export function ConfirmModal({
  open,
  title,
  children,
  onConfirm,
  onCancel,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'primary';
}) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onCancel}
      actions={
        <>
          <Button variant="ghost" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant={variant} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Modal>
  );
}
