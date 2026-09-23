import { useEffect, useRef } from 'react';
import type { StarlingPoint } from '@physiology/analysis';
import { useAnalysis } from '@store/analysis';
import { useSimulation } from '@store/simulation';
import { drawAxes, fitCanvas, niceCeil, toX, toY, type Axes } from './canvas';

interface Props {
  height: number;
}

/**
 * Curva di Frank-Starling (gittata sistolica anterograda vs PTD del VS) calcolata sul modello con i
 * parametri correnti, la curva normale di riferimento e il punto di lavoro attuale.
 */
export function StarlingCurve({ height }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const curve = useAnalysis((s) => s.curve);
  const refCurve = useAnalysis((s) => s.referenceCurve);
  const computing = useAnalysis((s) => s.computing);
  const beat = useSimulation((s) => s.beat);

  useEffect(() => {
    const canvas = ref.current;
    const g = canvas?.getContext('2d');
    if (!canvas || !g) return;
    const { w, h } = fitCanvas(canvas, g);
    let xmax = 25;
    let ymax = 100;
    for (const c of [curve, refCurve]) {
      for (const p of c ?? []) {
        xmax = Math.max(xmax, p.lvEdp);
        ymax = Math.max(ymax, p.sv);
      }
    }
    if (beat) {
      xmax = Math.max(xmax, beat.lvEdp);
      ymax = Math.max(ymax, beat.forwardSv);
    }
    const a: Axes = {
      x0: -5,
      x1: niceCeil(xmax * 1.05, 5),
      y0: 0,
      y1: niceCeil(ymax * 1.1, 20),
      left: 40,
      top: 10,
      width: w - 50,
      height: h - 44,
    };
    g.clearRect(0, 0, w, h);
    drawAxes(g, a, 'PTD VS (mmHg)', 'Gittata sistolica (mL)');
    const line = (c: StarlingPoint[] | null, color: string, width: number) => {
      if (!c) return;
      g.strokeStyle = color;
      g.lineWidth = width;
      g.beginPath();
      c.forEach((p, i) => {
        const x = toX(a, p.lvEdp);
        const y = toY(a, p.sv);
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      });
      g.stroke();
    };
    g.save();
    g.beginPath();
    g.rect(a.left, a.top, a.width, a.height);
    g.clip();
    line(refCurve, 'rgba(160,170,185,0.6)', 2);
    line(curve, '#4da3ff', 2.5);
    if (beat) {
      const x = toX(a, beat.lvEdp);
      const y = toY(a, beat.forwardSv);
      g.fillStyle = 'rgba(255,77,77,0.25)';
      g.beginPath();
      g.arc(x, y, 10, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#ff4d4d';
      g.beginPath();
      g.arc(x, y, 5, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
    g.font = '10px -apple-system, system-ui, sans-serif';
    g.textBaseline = 'top';
    g.textAlign = 'left';
    g.fillStyle = '#4da3ff';
    g.fillText('Condizione attuale', a.left + 6, a.top + 4);
    g.fillStyle = 'rgba(160,170,185,0.9)';
    g.fillText('Normale', a.left + 110, a.top + 4);
    g.fillStyle = '#ff4d4d';
    g.fillText('Punto di lavoro', a.left + 165, a.top + 4);
    if (computing) {
      g.fillStyle = 'rgba(220,228,238,0.7)';
      g.textAlign = 'right';
      g.fillText('ricalcolo…', a.left + a.width - 4, a.top + 4);
    }
  }, [curve, refCurve, computing, beat]);

  return (
    <canvas
      ref={ref}
      style={{ width: '100%', height, display: 'block', background: '#000', borderRadius: 12 }}
    />
  );
}
