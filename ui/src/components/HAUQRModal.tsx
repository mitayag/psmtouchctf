import { useCallback, useEffect, useRef } from 'react';
import { Button } from './Button';
import './HAUQRModal.css';

interface HAUQRModalProps {
  open: boolean;
  onClose: () => void;
}

export function HAUQRModal({ open, onClose }: HAUQRModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const openRef = useRef(false);

  useEffect(() => {
    if (open && !openRef.current) {
      openRef.current = true;
      previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
      requestAnimationFrame(() => {
        dialogRef.current?.focus();
      });
      return () => {
        previouslyFocusedRef.current?.focus();
      };
    }
    if (!open) {
      openRef.current = false;
    }
  }, [open]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
    }
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [open, handleKeyDown]);

  if (!open) return null;

  return (
    <div className="hauqr-backdrop" role="presentation">
      <div
        ref={dialogRef}
        className="hauqr-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="hauqr-title"
        tabIndex={-1}
      >
        <button
          className="hauqr-close-x"
          onClick={onClose}
          aria-label="Close QR code"
          type="button"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <div className="hauqr-content">
          <h2 id="hauqr-title" className="hauqr-title">HAU QR Code</h2>

          <div className="hauqr-image-wrap">
            <img
              src="/images/hau_qrcode.png"
              alt="Holy Angel University QR code"
              className="hauqr-image"
            />
          </div>

          <Button
            variant="primary"
            size="lg"
            fullWidth
            onClick={onClose}
          >
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
