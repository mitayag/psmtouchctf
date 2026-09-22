import { useEffect, useState } from 'react';
import { audio } from '../services/audio';
import './SoundToggle.css';

export function SoundToggle({ className = '' }: { className?: string }) {
  const [enabled, setEnabled] = useState(audio.isEnabled());
  const [volume, setVolume] = useState(audio.getVolume());
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const id = setInterval(() => {
      setEnabled(audio.isEnabled());
      setVolume(audio.getVolume());
    }, 200);
    return () => clearInterval(id);
  }, []);

  const toggle = () => {
    const next = !enabled;
    audio.setEnabled(next);
    setEnabled(next);
    if (next) audio.play('button');
  };

  return (
    <div className={`sound-toggle ${className}`}>
      <button
        type="button"
        className={`sound-toggle-btn ${enabled ? 'on' : 'off'}`}
        onClick={toggle}
        aria-pressed={enabled}
        aria-label={enabled ? 'Sound on' : 'Sound off'}
        title={enabled ? 'Sound on' : 'Sound off'}
      >
        <span className="sound-toggle-icon" aria-hidden="true">{enabled ? '🔊' : '🔇'}</span>
        <span className="sound-toggle-label">{enabled ? 'Sound on' : 'Sound off'}</span>
      </button>
      {enabled && (
        <button
          type="button"
          className="sound-toggle-expand"
          onClick={() => setExpanded((v) => !v)}
          aria-label="Adjust volume"
          aria-expanded={expanded}
        >
          ▾
        </button>
      )}
      {expanded && enabled && (
        <div className="sound-volume-popover">
          <label htmlFor="sound-volume" className="sound-volume-label">Volume</label>
          <input
            id="sound-volume"
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              audio.setVolume(v);
              setVolume(v);
            }}
            className="sound-volume-slider"
          />
        </div>
      )}
    </div>
  );
}
