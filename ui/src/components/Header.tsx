import { AnimationToggle } from './AnimationToggle';
import { SoundToggle } from './SoundToggle';
import './Header.css';

interface HeaderProps {
  title?: string;
  subtitle?: string;
  center?: React.ReactNode;
  right?: React.ReactNode;
  stats?: React.ReactNode;
}

export function Header({ title, subtitle, center, right, stats }: HeaderProps) {
  return (
    <div className={`app-header${stats ? ' app-header--with-stats' : ''}`}>
      <div className="app-header-row">
        <div className="app-header-brand">
          <img
            src="/images/logo-circle.png"
            alt="Holy Angel University"
            className="app-header-hau-logo"
          />
          <div className="app-header-titles">
            <span className="app-header-name">PSM <span className="neon-text-cyan">Touch</span><span className="neon-text-magenta">CTF</span></span>
            <span className="app-header-tagline">Capture. Crack. Defend.</span>
          </div>
        </div>

        <div className="app-header-center">
          {center || (
            <>
              {title && <h1 className="app-header-title">{title}</h1>}
              {subtitle && <span className="app-header-subtitle">{subtitle}</span>}
            </>
          )}
        </div>

        <div className="app-header-right">
          {right}
          <AnimationToggle />
          <SoundToggle />
        </div>
      </div>

      {stats && (
        <div className="app-header-stats-row">
          {stats}
        </div>
      )}
    </div>
  );
}
