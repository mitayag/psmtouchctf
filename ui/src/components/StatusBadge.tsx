import './StatusBadge.css';

interface StatusBadgeProps {
  status: 'online' | 'offline' | 'warning' | 'playing' | 'ready' | 'error';
  label: string;
}

export function StatusBadge({ status, label }: StatusBadgeProps) {
  return (
    <span className={`status-badge status-badge-${status}`}>
      <span className="status-dot" aria-hidden="true" />
      {label}
    </span>
  );
}
