import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { audio } from '../services/audio';
import './Button.css';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'magenta' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  fullWidth?: boolean;
  silent?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    fullWidth = false,
    silent = false,
    children,
    disabled,
    className = '',
    onClick,
    ...props
  },
  ref
) {
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!silent) audio.play('button');
    onClick?.(e);
  };

  return (
    <button
      ref={ref}
      className={`touch-target ctf-button ctf-button-${variant} ctf-button-${size} ${fullWidth ? 'ctf-button-full' : ''} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading}
      onClick={handleClick}
      {...props}
    >
      {loading && <span className="ctf-button-spinner" aria-hidden="true" />}
      <span className="ctf-button-label">{children}</span>
    </button>
  );
});
