import './Footer.css';

interface FooterProps {
  left?: React.ReactNode;
  center?: React.ReactNode;
  right?: React.ReactNode;
}

export function Footer({ left, center, right }: FooterProps) {
  return (
    <div className="app-footer">
      <div className="app-footer-left">{left}</div>
      <div className="app-footer-center">{center}</div>
      <div className="app-footer-right">{right}</div>
    </div>
  );
}
