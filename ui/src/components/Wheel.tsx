import { useEffect, useMemo, useRef, useState } from 'react';
import type { Prize } from '../types';
import { useReducedMotion } from '../hooks/useReducedMotion';
import './Wheel.css';

interface WheelProps {
  prizes: Prize[];
  diameter?: number;
  spinning?: boolean;
  targetSegment?: number;
  onSpinComplete?: () => void;
  onTick?: () => void;
  hubLabel?: string;
  hubSubLabel?: string;
}

const FALLBACK_COLORS = ['#0CC7EA', '#D82AC0', '#7B5FD9', '#151D33'];

const MAX_SEGMENTS = 12;

export function Wheel({
  prizes,
  diameter = 560,
  spinning = false,
  targetSegment = 0,
  onSpinComplete,
  onTick,
  hubLabel = 'SPIN',
  hubSubLabel = 'TO WIN',
}: WheelProps) {
  const reducedMotion = useReducedMotion();
  const [displayRotation, setDisplayRotation] = useState(0);
  const animRef = useRef<number | null>(null);
  const completedRef = useRef(false);

  const segments = useMemo(() => {
    const count = prizes.length || 1;
    return prizes.map((prize, i) => {
      const startAngle = (i * 360) / count;
      const endAngle = ((i + 1) * 360) / count;
      const midAngle = startAngle + (endAngle - startAngle) / 2;
      const color = prize.color || FALLBACK_COLORS[i % FALLBACK_COLORS.length];
      return { ...prize, startAngle, endAngle, midAngle, color };
    });
  }, [prizes]);

  const hasTooManySegments = prizes.length > MAX_SEGMENTS;

  useEffect(() => {
    if (!spinning || prizes.length === 0) return;
    completedRef.current = false;

    const count = Math.min(prizes.length, MAX_SEGMENTS);
    const segmentAngle = 360 / count;
    const pointerAt = 270;

    if (reducedMotion) {
      const targetAngle = targetSegment * segmentAngle + segmentAngle / 2;
      const rotation = (pointerAt - targetAngle + 360) % 360;
      setDisplayRotation(rotation);
      const timer = setTimeout(() => {
        if (!completedRef.current) {
          completedRef.current = true;
          onSpinComplete?.();
        }
      }, 300);
      return () => clearTimeout(timer);
    }

    const targetAngle = targetSegment * segmentAngle + segmentAngle / 2;
    const fullRotations = 4 + Math.floor(Math.random() * 3);
    const finalRotation = fullRotations * 360 + ((pointerAt - targetAngle) % 360 + 360) % 360;
    const start = performance.now();
    const duration = 5000;
    const startRotation = displayRotation;

    const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
    let lastTickSegment: number | null = null;

    const animate = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(1, elapsed / duration);
      const current = startRotation + (finalRotation - startRotation) * easeOut(progress);
      setDisplayRotation(current);

      const localAngle = ((pointerAt - current) % 360 + 360) % 360;
      const currentSegment = Math.floor(localAngle / segmentAngle);
      if (lastTickSegment !== null && currentSegment !== lastTickSegment) {
        onTick?.();
      }
      lastTickSegment = currentSegment;

      if (progress < 1) {
        animRef.current = requestAnimationFrame(animate);
      } else {
        setDisplayRotation(finalRotation % 360);
        if (!completedRef.current) {
          completedRef.current = true;
          onSpinComplete?.();
        }
      }
    };

    animRef.current = requestAnimationFrame(animate);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [spinning, targetSegment, prizes.length, reducedMotion, onSpinComplete, onTick]);

  const center = diameter / 2;
  const radius = diameter / 2 - 8;
  const innerRadius = radius * 0.68;
  const hubRadius = radius * 0.22;

  const describeArc = (start: number, end: number, r: number) => {
    const startRad = ((start - 90) * Math.PI) / 180;
    const endRad = ((end - 90) * Math.PI) / 180;
    const x1 = center + r * Math.cos(startRad);
    const y1 = center + r * Math.sin(startRad);
    const x2 = center + r * Math.cos(endRad);
    const y2 = center + r * Math.sin(endRad);
    const largeArc = end - start <= 180 ? 0 : 1;
    return `M ${center} ${center} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
  };

  if (prizes.length === 0) {
    return (
      <div className="wheel-container" style={{ width: '100%', height: '100%', maxWidth: diameter, maxHeight: diameter }}>
        <svg
          className="wheel-svg"
          viewBox={`0 0 ${diameter} ${diameter}`}
          width="100%"
          height="100%"
          role="img"
          aria-label="Prize wheel"
        >
          <defs>
            <filter id="wheelGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="6" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>
          <circle cx={center} cy={center} r={radius + 6} fill="none" stroke="#20E3FF" strokeWidth="4" filter="url(#wheelGlow)" opacity="0.3" />
          <circle cx={center} cy={center} r={radius + 2} fill="none" stroke="#20E3FF" strokeWidth="2" opacity="0.3" />
          <text
            x={center}
            y={center}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#B8C5DD"
            fontSize={diameter * 0.04}
            fontFamily="var(--font-display)"
            fontWeight={600}
          >
            No prizes available
          </text>
        </svg>
      </div>
    );
  }

  return (
    <div className="wheel-container" style={{ width: '100%', height: '100%', maxWidth: diameter, maxHeight: diameter }}>
      {hasTooManySegments && (
        <div
          role="alert"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 10,
            background: 'rgba(216, 42, 192, 0.15)',
            border: '1px solid rgba(216, 42, 192, 0.4)',
            borderRadius: 6,
            padding: '4px 8px',
            color: '#D82AC0',
            fontSize: 11,
            textAlign: 'center',
            fontFamily: 'var(--font-display)',
            fontWeight: 600,
          }}
        >
          Maximum {MAX_SEGMENTS} prizes supported — some may be hidden
        </div>
      )}

      <div className="wheel-pointer" aria-hidden="true">
        <svg viewBox="0 0 48 36" className="wheel-pointer-svg">
          <polygon points="4,0 44,0 24,36" fill="#FF4FD8" />
          <polygon points="12,0 36,0 24,28" fill="#D82AC0" opacity="0.5" />
        </svg>
      </div>

      <svg
        className="wheel-svg"
        viewBox={`0 0 ${diameter} ${diameter}`}
        width="100%"
        height="100%"
        role="img"
        aria-label="Prize wheel"
      >
        <defs>
          <filter id="wheelGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
          <radialGradient id="hubGradient" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#1A2640" />
            <stop offset="100%" stopColor="#070B17" />
          </radialGradient>
        </defs>

        {/* Outer rim glow */}
        <circle cx={center} cy={center} r={radius + 6} fill="none" stroke="#20E3FF" strokeWidth="4" filter="url(#wheelGlow)" opacity="0.7" />
        <circle cx={center} cy={center} r={radius + 2} fill="none" stroke="#20E3FF" strokeWidth="2" />
        <circle cx={center} cy={center} r={innerRadius} fill="none" stroke="#20E3FF" strokeWidth="2" opacity="0.6" />

        {/* Rotating group */}
        <g transform={`rotate(${displayRotation}, ${center}, ${center})`}>
          {segments.map((seg) => (
            <g key={seg.id}>
              <path
                d={describeArc(seg.startAngle, seg.endAngle, radius - 4)}
                fill={seg.color}
                stroke="rgba(255,255,255,0.08)"
                strokeWidth="1"
              />
              <g
                transform={`translate(${center + (radius * 0.55) * Math.cos(((seg.midAngle - 90) * Math.PI) / 180)}, ${center + (radius * 0.55) * Math.sin(((seg.midAngle - 90) * Math.PI) / 180)})`}
              >
                <text
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="#fff"
                  fontSize={radius * 0.10}
                  fontFamily="var(--font-display)"
                  fontWeight={700}
                  style={{ textShadow: '0 1px 4px rgba(0,0,0,0.7)' }}
                >
                  {seg.icon}
                </text>
                <text
                  textAnchor="middle"
                  y={radius * 0.14}
                  fill="#fff"
                  fontSize={radius * 0.05}
                  fontFamily="var(--font-display)"
                  fontWeight={700}
                  style={{ textShadow: '0 1px 4px rgba(0,0,0,0.7)' }}
                >
                  {seg.shortLabel}
                </text>
              </g>
            </g>
          ))}
        </g>

        {/* Center hub */}
        <circle cx={center} cy={center} r={hubRadius} fill="url(#hubGradient)" stroke="#20E3FF" strokeWidth="3" filter="url(#wheelGlow)" />
        <circle cx={center} cy={center} r={hubRadius - 6} fill="none" stroke="#FF4FD8" strokeWidth="1" opacity="0.6" />
        <text
          x={center}
          y={center - 6}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="#fff"
          fontSize={hubRadius * 0.55}
          fontFamily="var(--font-display)"
          fontWeight={700}
        >
          {hubLabel}
        </text>
        <text
          x={center}
          y={center + hubRadius * 0.35}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="#B8C5DD"
          fontSize={hubRadius * 0.25}
          fontFamily="var(--font-display)"
          fontWeight={600}
        >
          {hubSubLabel}
        </text>
      </svg>
    </div>
  );
}
