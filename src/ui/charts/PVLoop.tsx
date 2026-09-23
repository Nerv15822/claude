import { useEffect, useRef } from 'react';
import { F } from '@physiology/engine';
import type { ChamberParams } from '@physiology/params';
import { useAnalysis } from '@store/analysis';
import { SAMPLE_RATE, sampleBuffer } from '@store/sampleBuffer';
import { useSimulation } from '@store/simulation';
import { drawAxes, fitCanvas, niceCeil, toX, toY, type Axes } from './canvas';

interface Props {
  side: 'left' | 'right';
  height: number;
}

/**
 * Loop pressione-volume in tempo reale con ESPVR, EDPVR, elastanza arteriosa effettiva (Ea)
 * e il loop normale di riferimento in grigio.
 */
export function PVLoop({ side, height }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const state = useRef({
    chamber: null as ChamberParams | null,
    ref: null as Float32Array | null,
  });

  useEffect(() => {
    const L = side === 'left';
    const sync = () => {
      const p = useSimulation.getState().params;
      state.current.chamber = L ? p.lv : p.rv;
      const r = useAnalysis.getState().referenceLoop;
      state.current.ref = r ? (L ? r.lv : r.rv) : null;
    };
    sync();
    const u1 = useSimulation.subscribe(sync);
    const u2 = useAnalysis.subscribe(sync);
    return () => {
      u1();
      u2();
    };
  }, [side]);

  useEffect(() => {
    const canvas = ref.current;
    const g = canvas?.getContext('2d');
    if (!canvas || !g) return;
    const L = side === 'left';
    const vf = L ? F.vLV : F.vRV;
    const pf = L ? F.pLV : F.pRV;
    const outflow = L ? F.qAV : F.qPV;
    let raf = 0;
    let lastHead = -1;
    const axes: Axes = { x0: 0, x1: 200, y0: 0, y1: 150, left: 40, top: 10, width: 0, height: 0 };

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const { w, h } = fitCanvas(canvas, g);
      if (sampleBuffer.head === lastHead) return;
      lastHead = sampleBuffer.head;
      axes.width = w - axes.left - 10;
      axes.height = h - axes.top - 34;
      const n = Math.min(sampleBuffer.head, Math.round(1.6 * SAMPLE_RATE));
      if (n < 10) return;
      const start = sampleBuffer.head - n;

      // Scala: include loop corrente e riferimento
      let vmax = 0;
      let pmax = 0;
      for (let i = 0; i < n; i++) {
        vmax = Math.max(vmax, sampleBuffer.get(start + i, vf));
        pmax = Math.max(pmax, sampleBuffer.get(start + i, pf));
      }
      const ref = state.current.ref;
      if (ref) {
        for (let i = 0; i < ref.length; i += 2) {
          vmax = Math.max(vmax, ref[i]!);
          pmax = Math.max(pmax, ref[i + 1]!);
        }
      }
      const vTarget = niceCeil(vmax * 1.1, 50);
      const pTarget = niceCeil(pmax * 1.1, L ? 25 : 10);
      if (vTarget > axes.x1 || vTarget < axes.x1 * 0.7) axes.x1 = vTarget;
      if (pTarget > axes.y1 || pTarget < axes.y1 * 0.7) axes.y1 = pTarget;
      axes.y0 = -5;

      g.clearRect(0, 0, w, h);
      drawAxes(g, axes, 'Volume (mL)', 'Pressione (mmHg)');
      g.save();
      g.beginPath();
      g.rect(axes.left, axes.top, axes.width, axes.height);
      g.clip();

      // Relazioni di fine sistole e fine diastole (transmurali)
      const c = state.current.chamber;
      if (c) {
        g.lineWidth = 1.2;
        g.strokeStyle = 'rgba(255, 210, 77, 0.8)';
        g.beginPath();
        g.moveTo(toX(axes, c.vd), toY(axes, 0));
        g.lineTo(toX(axes, axes.x1), toY(axes, c.ees * (axes.x1 - c.vd)));
        g.stroke();
        g.strokeStyle = 'rgba(77, 163, 255, 0.8)';
        g.beginPath();
        for (let v = c.v0; v <= axes.x1; v += 2) {
          const p = c.p0 * (Math.exp(c.lambda * (v - c.v0)) - 1);
          const x = toX(axes, v);
          const y = toY(axes, p);
          if (v === c.v0) g.moveTo(x, y);
          else g.lineTo(x, y);
          if (p > axes.y1) break;
        }
        g.stroke();
      }

      // Loop di riferimento
      if (ref) {
        g.strokeStyle = 'rgba(160,170,185,0.55)';
        g.lineWidth = 2;
        g.beginPath();
        for (let i = 0; i < ref.length; i += 2) {
          const x = toX(axes, ref[i]!);
          const y = toY(axes, ref[i + 1]!);
          if (i === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.closePath();
        g.stroke();
      }

      // Elastanza arteriosa effettiva: dalla fine sistole (chiusura semilunare) al VTD a P=0
      let esv = 0;
      let pes = 0;
      let edv = 0;
      for (let i = 1; i < n; i++) {
        const qa = sampleBuffer.get(start + i - 1, outflow);
        const qb = sampleBuffer.get(start + i, outflow);
        if (qa > 0 && qb <= 0) {
          esv = sampleBuffer.get(start + i, vf);
          pes = sampleBuffer.get(start + i, pf);
        }
        edv = Math.max(edv, sampleBuffer.get(start + i, vf));
      }
      if (pes > 0 && edv > esv) {
        g.setLineDash([4, 4]);
        g.strokeStyle = 'rgba(255,77,77,0.7)';
        g.lineWidth = 1.2;
        g.beginPath();
        g.moveTo(toX(axes, esv), toY(axes, pes));
        g.lineTo(toX(axes, edv), toY(axes, 0));
        g.stroke();
        g.setLineDash([]);
      }

      // Loop corrente con scia sfumata
      const segs = 6;
      const per = Math.ceil(n / segs);
      g.lineWidth = 2.2;
      g.lineJoin = 'round';
      for (let s = 0; s < segs; s++) {
        g.strokeStyle = `rgba(242,245,249,${((s + 1) / segs).toFixed(2)})`;
        g.beginPath();
        const a = s * per;
        const b = Math.min(n - 1, (s + 1) * per);
        for (let i = a; i <= b; i++) {
          const x = toX(axes, sampleBuffer.get(start + i, vf));
          const y = toY(axes, sampleBuffer.get(start + i, pf));
          if (i === a) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.stroke();
      }
      const cx = toX(axes, sampleBuffer.get(sampleBuffer.head - 1, vf));
      const cy = toY(axes, sampleBuffer.get(sampleBuffer.head - 1, pf));
      g.fillStyle = '#ff4d4d';
      g.beginPath();
      g.arc(cx, cy, 4, 0, Math.PI * 2);
      g.fill();
      g.restore();

      // Legenda
      g.font = '10px -apple-system, system-ui, sans-serif';
      g.textAlign = 'left';
      g.textBaseline = 'top';
      const items: [string, string][] = [
        ['ESPVR', 'rgba(255,210,77,0.9)'],
        ['EDPVR', 'rgba(77,163,255,0.9)'],
        ['Ea', 'rgba(255,77,77,0.9)'],
        ['Normale', 'rgba(160,170,185,0.9)'],
      ];
      let lx = axes.left + 6;
      for (const [t, col] of items) {
        g.fillStyle = col;
        g.fillText(t, lx, axes.top + 4);
        lx += g.measureText(t).width + 10;
      }
      if (pes > 0 && edv > esv && c) {
        g.fillStyle = 'rgba(220,228,238,0.85)';
        g.textAlign = 'right';
        const ea = pes / (edv - esv);
        g.fillText(
          `Ees ${c.ees.toFixed(2)} · Ea ${ea.toFixed(2)} mmHg/mL · Ea/Ees ${(ea / c.ees).toFixed(2)}`,
          axes.left + axes.width - 4,
          axes.top + 18,
        );
      }
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [side]);

  return (
    <canvas
      ref={ref}
      style={{ width: '100%', height, display: 'block', background: '#000', borderRadius: 12 }}
    />
  );
}
