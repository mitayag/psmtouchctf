import './TouchKeyboard.css';

interface TouchKeyboardProps {
  onKey: (key: string) => void;
  onBackspace: () => void;
  onDone: () => void;
  mode?: 'text' | 'flag';
}

const ROWS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['Z', 'X', 'C', 'V', 'B', 'N', 'M'],
];

export function TouchKeyboard({ onKey, onBackspace, onDone, mode = 'text' }: TouchKeyboardProps) {
  return (
    <div className="touch-keyboard" role="group" aria-label="On-screen keyboard">
      {ROWS.map((row, i) => (
        <div key={i} className="touch-keyboard-row">
          {row.map((key) => (
            <button
              key={key}
              type="button"
              className="touch-key"
              onClick={() => onKey(key)}
              aria-label={key}
            >
              {key}
            </button>
          ))}
        </div>
      ))}
      <div className="touch-keyboard-row">
        {mode === 'flag' && (
          <>
            <button type="button" className="touch-key touch-key-wide" onClick={() => onKey('{')} aria-label="Left brace">
              {'{'}
            </button>
            <button type="button" className="touch-key touch-key-wide" onClick={() => onKey('_')} aria-label="Underscore">
              _
            </button>
            <button type="button" className="touch-key touch-key-wide" onClick={() => onKey('}')} aria-label="Right brace">
              {'}'}
            </button>
          </>
        )}
        {mode === 'text' && (
          <button type="button" className="touch-key touch-key-space" onClick={() => onKey(' ')} aria-label="Space">
            SPACE
          </button>
        )}
        <button type="button" className="touch-key touch-key-wide" onClick={onBackspace} aria-label="Backspace">
          ←
        </button>
        <button type="button" className="touch-key touch-key-done" onClick={onDone} aria-label="Done">
          DONE
        </button>
      </div>
    </div>
  );
}
