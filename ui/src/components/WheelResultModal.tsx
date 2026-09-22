import { useCallback, useEffect, useRef } from 'react';
import { Button } from './Button';
import './WheelResultModal.css';

interface WheelResultModalProps {
  open: boolean;
  onClose: () => void;
  /** Prize icon (emoji) */
  icon: string;
  /** Prize display name */
  prizeName: string;
  /** true = live gameplay with claim code; false = preview/demo */
  live?: boolean;
  /** Claim code for live wins */
  claimCode?: string;
}

export function WheelResultModal({
  open,
  onClose,
  icon,
  prizeName,
  live = false,
  claimCode,
}: WheelResultModalProps) {
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
    <div className="wrm-backdrop" role="presentation">
      <div
        ref={dialogRef}
        className="wrm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wrm-title"
        tabIndex={-1}
      >
        {/* Close X button */}
        <button
          className="wrm-close-x"
          onClick={onClose}
          aria-label="Close result"
          type="button"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* Confetti (live only) */}
        {live && (
          <div className="wrm-confetti" aria-hidden="true">
            <div className="wrm-confetti-piece" style={{ '--c1': '#20E3FF', '--c2': '#FF4FD8', left: '8%', animationDelay: '0s' } as React.CSSProperties} />
            <div className="wrm-confetti-piece" style={{ '--c1': '#FF4FD8', '--c2': '#A98BFF', left: '25%', animationDelay: '0.15s' } as React.CSSProperties} />
            <div className="wrm-confetti-piece" style={{ '--c1': '#A98BFF', '--c2': '#20E3FF', left: '42%', animationDelay: '0.3s' } as React.CSSProperties} />
            <div className="wrm-confetti-piece" style={{ '--c1': '#20E3FF', '--c2': '#FF4FD8', left: '58%', animationDelay: '0.1s' } as React.CSSProperties} />
            <div className="wrm-confetti-piece" style={{ '--c1': '#FF4FD8', '--c2': '#A98BFF', left: '75%', animationDelay: '0.25s' } as React.CSSProperties} />
            <div className="wrm-confetti-piece" style={{ '--c1': '#A98BFF', '--c2': '#20E3FF', left: '92%', animationDelay: '0.05s' } as React.CSSProperties} />
          </div>
        )}

        <div className="wrm-content">
          <div className="wrm-icon" aria-hidden="true">{icon}</div>

          {live ? (
            <>
              <h2 id="wrm-title" className="wrm-title wrm-title--live">Congratulations!</h2>
              <p className="wrm-prize-name">You won <strong>{prizeName}</strong>!</p>
              {claimCode && (
                <div className="wrm-claim">
                  <span className="wrm-claim-label">Your claim code</span>
                  <span className="wrm-claim-code">{claimCode}</span>
                </div>
              )}
              <p className="wrm-instruction">Show this code to booth staff to claim your prize.</p>
            </>
          ) : (
            <>
              <h2 id="wrm-title" className="wrm-title wrm-title--preview">Preview result</h2>
              <p className="wrm-prize-name">Selected prize: <strong>{prizeName}</strong></p>
              <p className="wrm-simulation-notice">Simulation only — no prize awarded. Inventory is unchanged.</p>
            </>
          )}

          <Button
            variant={live ? 'primary' : 'secondary'}
            size="lg"
            fullWidth
            onClick={onClose}
          >
            {live ? 'Done' : 'Close'}
          </Button>
        </div>
      </div>
    </div>
  );
}
