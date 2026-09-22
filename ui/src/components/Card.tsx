import type { ReactNode } from 'react';
import './Card.css';

interface CardProps {
  children: ReactNode;
  className?: string;
  variant?: 'default' | 'raised' | 'glow';
  padding?: 'sm' | 'md' | 'lg';
}

export function Card({ children, className = '', variant = 'default', padding = 'md' }: CardProps) {
  return (
    <div className={`ctf-card ctf-card-${variant} ctf-card-padding-${padding} ${className}`}>
      {children}
    </div>
  );
}
