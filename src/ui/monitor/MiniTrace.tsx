import { useEffect, useRef } from 'react';
import { F } from '@physiology/engine';
import { SAMPLE_RATE, sampleBuffer } from '@store/sampleBuffer';

interface Props {
  field: keyof typeof F;
  color: string;
  min: number;
  max: number;
  seconds?: number;
  label: string;
}

/** Tracciato scorrevole minimale su canvas (la versione completa arriva nella Fase 3). */
export function MiniTrace({ field, color, min, max, seconds = 5, label }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const g = canvas.getContext('2d');
    if (!g) return;
    let raf = 0;
    const idx = F[field];
    // Il canvas non risolve le variabili CSS: si legge il valore calcolato.
    const m = /^var\((--[\w-]+)\)$/.exec(color);
    const stroke = m?.[1] ? getComputedStyle(canvas).getPropertyValue(m[1]).trim() || '#fff' : color;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      const n = Math.min(sampleBuffer.head, seconds * SAMPLE_RATE);
      if (n < 2) return;
      g.strokeStyle = stroke;
      g.lineWidth = 1.6;
      g.beginPath();
      const start = sampleBuffer.head - n;
      const span = seconds * SAMPLE_RATE;
      for (let i = 0; i < n; i++) {
        const v = sampleBuffer.get(start + i, idx);
        const x = w - ((n - 1 - i) / span) * w;
        const y = h - ((v - min) / (max - min)) * h;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [field, color, min, max, seconds]);

  return (
    <div style={{ position: 'relative' }}>
      <span style={{ position: 'absolute', left: 6, top: 2, fontSize: 11, color }}>{label}</span>
      <canvas
        ref={ref}
        style={{ width: '100%', height: 70, display: 'block', background: '#000', borderRadius: 8 }}
      />
    </div>
  );
}
