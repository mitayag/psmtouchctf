import { useEffect, useState } from 'react';
import { animations } from '../services/animations';
import './AnimationToggle.css';

export function AnimationToggle({ className = '' }: { className?: string }) {
  const [enabled, setEnabled] = useState(animations.isEnabled());

  useEffect(() => {
    return animations.subscribe(setEnabled);
  }, []);

  return (
    <button
      type="button"
      className={`animation-toggle ${enabled ? 'on' : 'off'} ${className}`}
      onClick={() => animations.setEnabled(!enabled)}
      aria-pressed={enabled}
      aria-label={enabled ? 'Animations on' : 'Animations off'}
      title={enabled ? 'Animations on' : 'Animations off'}
    >
      <span className="animation-toggle-icon" aria-hidden="true">{enabled ? '✨' : '⛔'}</span>
      <span className="animation-toggle-label">{enabled ? 'Effects on' : 'Effects off'}</span>
    </button>
  );
}
