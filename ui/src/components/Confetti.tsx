import { useEffect, useRef } from 'react';
import { useReducedMotion } from '../hooks/useReducedMotion';
import './Confetti.css';

interface ConfettiProps {
  active: boolean;
  count?: number;
  colors?: string[];
}

export function Confetti({ active, count = 80, colors = ['#20E3FF', '#FF4FD8', '#FFD700', '#A98BFF', '#53F5AD'] }: ConfettiProps) {
  const reducedMotion = useReducedMotion();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const particlesRef = useRef<Array<{
    x: number;
    y: number;
    vx: number;
    vy: number;
    rotation: number;
    vr: number;
    color: string;
    size: number;
    life: number;
    maxLife: number;
  }> | null>(null);

  useEffect(() => {
    if (!active || reducedMotion) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = canvas.offsetWidth * window.devicePixelRatio;
      canvas.height = canvas.offsetHeight * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };
    resize();
    window.addEventListener('resize', resize);

    const width = canvas.offsetWidth;
    const height = canvas.offsetHeight;
    particlesRef.current = Array.from({ length: count }).map(() => ({
      x: width / 2 + (Math.random() - 0.5) * width * 0.4,
      y: height * 0.25,
      vx: (Math.random() - 0.5) * 12,
      vy: -Math.random() * 10 - 4,
      rotation: Math.random() * 360,
      vr: (Math.random() - 0.5) * 10,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: Math.random() * 8 + 4,
      life: 0,
      maxLife: 120 + Math.random() * 60,
    }));

    const gravity = 0.25;
    let frame = 0;

    const draw = () => {
      frame++;
      if (frame % 2 !== 0) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }
      ctx.clearRect(0, 0, width, height);
      const particles = particlesRef.current;
      if (!particles) return;

      let alive = false;
      for (const p of particles) {
        if (p.life >= p.maxLife) continue;
        alive = true;
        p.x += p.vx;
        p.y += p.vy;
        p.vy += gravity;
        p.rotation += p.vr;
        p.life++;

        const alpha = 1 - p.life / p.maxLife;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size / 2);
        ctx.restore();
      }

      if (alive) {
        rafRef.current = requestAnimationFrame(draw);
      } else {
        particlesRef.current = null;
      }
    };

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      window.removeEventListener('resize', resize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      particlesRef.current = null;
    };
  }, [active, reducedMotion, count, colors]);

  if (!active || reducedMotion) return null;
  return <canvas ref={canvasRef} className="confetti-canvas" aria-hidden="true" />;
}
