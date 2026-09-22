import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Footer } from '../components/Footer';
import { Header } from '../components/Header';
import { Shell } from '../components/Shell';
import { TouchKeyboard } from '../components/TouchKeyboard';
import { SoundActivator } from '../components/SoundActivator';
import { createSession } from '../hooks/useGameSession';
import { generateAlias } from '../services/fixtureData';
import type { AccessibilityMode } from '../types';
import './RegisterScreen.css';

const VALID_NAME = /^[a-zA-Z0-9 _\-]{0,20}$/;

export function RegisterScreen() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const [alias, setAlias] = useState<string>((state as { nickname?: string } | null)?.nickname || '');
  const [consent, setConsent] = useState(true);
  const [mode, setMode] = useState<AccessibilityMode>('standard');
  const [showRules, setShowRules] = useState(false);
  const [error, setError] = useState('');
  const [keyboardVisible, setKeyboardVisible] = useState(true);
  const [isReadying, setIsReadying] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const readyButtonRef = useRef<HTMLButtonElement>(null);

  const validate = useCallback((value: string): string => {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return ''; // empty is valid — will generate alias at submit
    }
    if (trimmed.length < 2 || trimmed.length > 20) {
      return 'Nickname must be 2–20 characters.';
    }
    if (!VALID_NAME.test(trimmed)) {
      return 'Letters, numbers, spaces, hyphens, and underscores only.';
    }
    return '';
  }, []);

  const onKey = useCallback((key: string) => {
    setAlias((a) => (a.length < 20 ? a + key : a));
    setError('');
  }, []);

  const onBackspace = useCallback(() => {
    setAlias((a) => a.slice(0, -1));
    setError('');
  }, []);

  const closeKeyboard = useCallback(() => {
    setKeyboardVisible(false);
    inputRef.current?.blur();
    readyButtonRef.current?.focus({ preventScroll: true });
  }, []);

  const openKeyboard = useCallback(() => {
    setKeyboardVisible(true);
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  const ready = async () => {
    if (isReadying) return;

    const trimmed = alias.trim();
    if (trimmed.length > 0) {
      const validationError = validate(trimmed);
      if (validationError) {
        setError(validationError);
        openKeyboard();
        return;
      }
    }

    const name = trimmed || generateAlias();
    setIsReadying(true);

    try {
      const session = await createSession(name, consent, mode, true);
      navigate(`/play/${session.id}/ready`);
    } catch (e) {
      setError((e as Error).message || 'Failed to start. Please try again.');
      setIsReadying(false);
    }
  };

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        closeKeyboard();
        return;
      }
      if (e.key === 'Backspace') {
        e.preventDefault();
        onBackspace();
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        closeKeyboard();
        return;
      }
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (e.key.match(/[a-zA-Z0-9 _\-]/)) {
          e.preventDefault();
          onKey(e.key.toUpperCase());
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [closeKeyboard, onBackspace, onKey]);

  useEffect(() => {
    if (error) setError(validate(alias.trim()));
  }, [alias, error, validate]);

  return (
    <Shell
      header={<Header title="Registration" subtitle="Get ready to play" />}
      footer={
        <Footer
          left={<Button variant="ghost" size="sm" onClick={() => navigate('/')}>← Back to home</Button>}
          center="PEOPLE + SKILLS + TECHNOLOGY = A SAFER TOMORROW"
        />
      }
    >
      <div className="register-layout">
        <Card className="register-card" padding="lg">
          <h1 className="register-title">Ready to begin?</h1>
          <p className="register-subtitle">Enter a nickname, review the rules, and choose your play style.</p>

          <label htmlFor="alias" className="register-label">Nickname (optional)</label>
          <input
            ref={inputRef}
            id="alias"
            type="text"
            className={`register-input ${error ? 'invalid' : ''}`}
            value={alias}
            onChange={(e) => {
              const v = e.target.value.slice(0, 20);
              if (v === '' || VALID_NAME.test(v)) {
                setAlias(v);
                setError('');
              }
            }}
            onFocus={openKeyboard}
            placeholder="CyberPlayer"
            maxLength={20}
            readOnly
            aria-invalid={!!error}
            aria-describedby={error ? 'alias-error' : 'alias-hint'}
            autoComplete="off"
          />
          {keyboardVisible && (
            <TouchKeyboard onKey={onKey} onBackspace={onBackspace} onDone={closeKeyboard} mode="text" />
          )}
          {error ? (
            <p id="alias-error" className="register-error" role="alert">{error}</p>
          ) : (
            <p id="alias-hint" className="register-hint">No personal info required. Generated aliases are fine.</p>
          )}

          <div className="register-options">
            <label className="register-checkbox">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span>Appear on the public leaderboard</span>
            </label>
            <label className="register-checkbox">
              <input
                type="checkbox"
                checked={mode === 'reduced-motion'}
                onChange={(e) => setMode(e.target.checked ? 'reduced-motion' : 'standard')}
              />
              <span>Reduce motion</span>
            </label>
            <label className="register-checkbox">
              <input
                type="checkbox"
                checked={mode === 'extended-time'}
                onChange={(e) => setMode(e.target.checked ? 'extended-time' : 'standard')}
              />
              <span>Extended time (separate leaderboard)</span>
            </label>
          </div>

          <div className="register-actions">
            <Button variant="secondary" size="md" onClick={() => setShowRules(true)}>How to play</Button>
            <Button ref={readyButtonRef} variant="primary" size="md" onClick={ready} data-testid="ready-button" disabled={isReadying}>
              {isReadying ? 'Starting…' : 'Ready to begin'}
            </Button>
          </div>
          <div className="register-sound">
            <SoundActivator compact />
          </div>
        </Card>
      </div>

      {showRules && (
        <div className="register-rules" role="dialog" aria-modal="true" aria-labelledby="rules-title">
          <Card padding="lg">
            <h2 id="rules-title" className="register-title">How to play</h2>
            <ul className="register-rules-list">
              <li>You will receive 3 mini-challenges: one Phishing Hunt, one Log Detective, and one Decode the Flag.</li>
              <li>You have {180} seconds and 2 attempts per challenge. Hints are available but cost points.</li>
              <li>Solve at least 2 of the 3 challenges and capture the final flag before time expires to unlock one prize spin.</li>
              <li>Only qualified players spin the wheel; prizes are physical swag while stock lasts.</li>
              <li>Scores depend on accuracy, hints, attempts, and remaining time.</li>
            </ul>
            <Button variant="primary" fullWidth onClick={() => setShowRules(false)}>Got it</Button>
          </Card>
        </div>
      )}
    </Shell>
  );
}
