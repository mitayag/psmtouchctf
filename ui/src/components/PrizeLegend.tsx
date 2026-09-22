import type { Prize } from '../types';
import './PrizeLegend.css';

interface PrizeLegendProps {
  prizes: Prize[];
}

export function PrizeLegend({ prizes }: PrizeLegendProps) {
  return (
    <ul className="prize-legend" aria-label="Possible prizes">
      {prizes.map((prize) => (
        <li key={prize.id} className="prize-legend-item">
          <span className="prize-legend-icon" style={{ color: prize.color }} aria-hidden="true">
            {prize.icon}
          </span>
          <div className="prize-legend-text">
            <span className="prize-legend-name">{prize.label}</span>
            <span className="prize-legend-desc">{prize.description}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
