import './StatusOverlay.css';

interface StatusOverlayProps {
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

export function StatusOverlay({ loading, error, onRetry }: StatusOverlayProps) {
  if (error) {
    return (
      <div className="status-overlay" role="alert" aria-live="assertive">
        <h2 className="status-overlay__title">Connection problem</h2>
        <p className="status-overlay__message">{error}</p>
        {onRetry && (
          <button className="status-overlay__retry" onClick={onRetry} type="button">
            Retry
          </button>
        )}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="status-overlay" role="status" aria-live="polite">
        <div className="status-overlay__spinner" aria-hidden="true" />
        <p className="status-overlay__title">Loading…</p>
      </div>
    );
  }

  return null;
}
