import type { ReactNode } from 'react';
import './Shell.css';

interface ShellProps {
  header: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Shell({ header, footer, children, className = '' }: ShellProps) {
  return (
    <div className={`shell ${className}`}>
      <div className="city-bg" aria-hidden="true" />
      <div className="grid-overlay" aria-hidden="true" />
      <header className="shell-header">{header}</header>
      <main className="shell-main">{children}</main>
      {footer && <footer className="shell-footer">{footer}</footer>}
    </div>
  );
}
