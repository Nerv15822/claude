import { useEffect, useRef } from 'react';
import { F, type SampleField } from '@physiology/engine';
import type { BeatMetrics, RespMetrics } from '@physiology/metrics';
import { SAMPLE_RATE, sampleBuffer } from '@store/sampleBuffer';
import { useSimulation } from '@store/simulation';
import { fitCanvas, niceCeil, niceStep, resolveColor } from './canvas';

export interface Lane {
  field: SampleField;
  label: string;
  color: string;
  /** Scala fissa [min, max]; se assente, fondo scala automatico */
  range?: [number, number];
  /** Normalizza min–max sulla finestra (pletismografia) */
  normalize?: boolean;
  /** Testo numerico grande a destra */
  value?: (b: BeatMetrics, r: RespMetrics | null) => string;
  unit?: string;
  /** Peso relativo dell'altezza della corsia */
  weight?: number;
}

interface Props {
  lanes: Lane[];
  seconds?: number;
  height: number;
}

interface LaneScale {
  lo: number;
  hi: number;
}

/**
 * Tracciati scorrevoli sincronizzati in stile monitor multiparametrico (un solo canvas).
 * Legge il buffer circolare dei campioni senza allocazioni nel loop di disegno.
 */
export function StripChart({ lanes, seconds = 6, height }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const metrics = useRef<{ b: BeatMetrics | null; r: RespMetrics | null }>({ b: null, r: null });

  useEffect(
    () =>
      useSimulation.subscribe((s) => {
        metrics.current.b = s.beat;
        metrics.current.r = s.resp;
      }),
    [],
  );

  useEffect(() => {
    const canvas = ref.current;
    const g = canvas?.getContext('2d');
    if (!canvas || !g) return;
    const scales: LaneScale[] = lanes.map((l) => ({ lo: l.range?.[0] ?? 0, hi: l.range?.[1] ?? 10 }));
    const colors = lanes.map((l) => resolveColor(l.color));
    const totalWeight = lanes.reduce((a, l) => a + (l.weight ?? 1), 0);
    let raf = 0;
    let lastHead = -1;
    let lastW = 0;

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const { w, h } = fitCanvas(canvas, g);
      if (sampleBuffer.head === lastHead && w === lastW) return;
      lastHead = sampleBuffer.head;
      lastW = w;
      g.clearRect(0, 0, w, h);

      const valueW = w < 480 ? 92 : 132;
      const plotW = w - valueW - 4;
      const span = seconds * SAMPLE_RATE;
      const n = Math.min(sampleBuffer.head, span);
      const start = sampleBuffer.head - n;
      const pxPerSample = plotW / span;
      const stride = Math.max(1, Math.floor(1 / (pxPerSample * 1.5)));

      // Griglia temporale (1 s)
      g.strokeStyle = 'rgba(255,255,255,0.05)';
      g.lineWidth = 1;
      if (n > 0) {
        const tEnd = sampleBuffer.get(sampleBuffer.head - 1, F.t);
        for (let s = Math.floor(tEnd); s > tEnd - seconds; s--) {
          const x = plotW - (tEnd - s) * SAMPLE_RATE * pxPerSample;
          g.beginPath();
          g.moveTo(x, 0);
          g.lineTo(x, h);
          g.stroke();
        }
      }

      let y0 = 0;
      const { b, r } = metrics.current;
      for (let li = 0; li < lanes.length; li++) {
        const lane = lanes[li]!;
        const lh = (h * (lane.weight ?? 1)) / totalWeight;
        const idx = F[lane.field];
        const sc = scales[li]!;
        const color = colors[li]!;

        // Fondo scala automatico o normalizzato
        if (!lane.range && n > 1) {
          let mn = Infinity;
          let mx = -Infinity;
          for (let i = 0; i < n; i += stride) {
            const v = sampleBuffer.get(start + i, idx);
            if (v < mn) mn = v;
            if (v > mx) mx = v;
          }
          if (lane.normalize) {
            const pad = (mx - mn) * 0.1 + 1e-6;
            sc.lo = mn - pad;
            sc.hi = mx + pad;
          } else if (mx > sc.hi || mx < 0.55 * sc.hi || mn < sc.lo || (sc.lo < 0 && mn > 0.5 * sc.lo)) {
            const step = niceStep(Math.max(mx, 5), 4);
            sc.hi = niceCeil(mx * 1.08 + 0.5, step);
            sc.lo = mn < 0 ? -niceCeil(-mn * 1.1, step / 2) : 0;
          }
        }

        g.save();
        g.beginPath();
        g.rect(0, y0, plotW, lh);
        g.clip();
        // Linee di scala
        if (!lane.normalize) {
          g.fillStyle = 'rgba(200,210,225,0.45)';
          g.font = '9px -apple-system, system-ui, sans-serif';
          g.textAlign = 'right';
          g.textBaseline = 'top';
          g.fillText(fmtScale(sc.hi), plotW - 2, y0 + 2);
          g.textBaseline = 'bottom';
          g.fillText(fmtScale(sc.lo), plotW - 2, y0 + lh - 1);
          g.textAlign = 'left';
        }
        g.fillStyle = color;
        g.font = '600 11px -apple-system, system-ui, sans-serif';
        g.textBaseline = 'top';
        g.fillText(lane.label, 2, y0 + 1);

        if (n > 1) {
          g.strokeStyle = color;
          g.lineWidth = 1.5;
          g.lineJoin = 'round';
          g.beginPath();
          const k = lh / (sc.hi - sc.lo);
          const base = y0 + lh - 2;
          for (let i = 0; i < n; i += stride) {
            const v = sampleBuffer.get(start + i, idx);
            const x = plotW - (n - 1 - i) * pxPerSample;
            const y = base - (v - sc.lo) * k * ((lh - 4) / lh);
            if (i === 0) g.moveTo(x, y);
            else g.lineTo(x, y);
          }
          g.stroke();
        }
        g.restore();

        // Valore numerico grande
        if (lane.value && b) {
          g.fillStyle = color;
          g.textAlign = 'right';
          g.textBaseline = 'middle';
          const text = lane.value(b, r);
          const size = Math.min(lh * 0.5, w < 480 ? 20 : 28);
          g.font = `600 ${Math.round(size)}px -apple-system, system-ui, sans-serif`;
          g.fillText(text, w - 4, y0 + lh * 0.55);
          if (lane.unit) {
            g.font = '10px -apple-system, system-ui, sans-serif';
            g.globalAlpha = 0.7;
            g.fillText(lane.unit, w - 4, y0 + 8);
            g.globalAlpha = 1;
          }
          g.textAlign = 'left';
        }
        // Separatore
        g.strokeStyle = 'rgba(255,255,255,0.08)';
        g.beginPath();
        g.moveTo(0, y0 + lh - 0.5);
        g.lineTo(w, y0 + lh - 0.5);
        g.stroke();
        y0 += lh;
      }
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [lanes, seconds]);

  return (
    <canvas
      ref={ref}
      style={{ width: '100%', height, display: 'block', background: '#000', borderRadius: 12 }}
    />
  );
}

const fmtScale = (v: number) => (Math.abs(v) < 5 && v !== 0 ? v.toFixed(1) : Math.round(v).toString());
