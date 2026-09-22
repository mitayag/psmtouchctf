import { useEffect, useState } from 'react';
import { audio } from '../services/audio';
import './SoundActivator.css';

export function SoundActivator({ compact = false }: { compact?: boolean }) {
  const [enabled, setEnabled] = useState(audio.isEnabled());
  const [loading, setLoading] = useState(audio.isLoading());
  const [error, setError] = useState<string | null>(audio.getError());
  const [volume, setVolume] = useState(audio.getVolume());

  useEffect(() => {
    const id = setInterval(() => {
      setEnabled(audio.isEnabled());
      setLoading(audio.isLoading());
      setError(audio.getError());
      setVolume(audio.getVolume());
    }, 200);
    return () => clearInterval(id);
  }, []);

  const activate = async () => {
    setLoading(true);
    const ok = await audio.enable();
    setLoading(false);
    if (ok) {
      audio.play('button');
    }
  };

  const test = () => {
    audio.play('button');
  };

  const toggleMute = () => {
    audio.setEnabled(!enabled);
  };

  return (
    <div className="sound-activator">
      <div className="sound-activator-label">
        <strong>{enabled ? 'Sound on' : 'Sound off'}</strong>
        {!compact && <span>{enabled ? 'Effects are enabled.' : 'Tap enable to unlock audio.'}</span>}
      </div>
      <div className="sound-activator-actions">
        {!enabled ? (
          <button
            type="button"
            className="sound-activator-btn"
            onClick={activate}
            disabled={loading}
            aria-label="Enable sound and test"
          >
            {loading ? 'Loading…' : '🔊 Enable sound & test'}
          </button>
        ) : (
          <>
            <button type="button" className="sound-activator-btn sound-activator-test" onClick={test} aria-label="Test sound">
              Test sound
            </button>
            <button type="button" className="sound-activator-btn" onClick={toggleMute} aria-label="Mute sound">
              🔇 Mute
            </button>
            <label className="sound-activator-volume" aria-label="Volume">
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={volume}
                onChange={(e) => audio.setVolume(parseFloat(e.target.value))}
              />
            </label>
          </>
        )}
      </div>
      {error && <span className="sound-activator-status">{error}</span>}
    </div>
  );
}
