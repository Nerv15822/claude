import { useEffect, useRef } from 'react';
import { F } from '@physiology/engine';
import { SAMPLE_RATE, sampleBuffer } from '@store/sampleBuffer';
import { fitCanvas, niceCeil, niceStep, resolveColor } from './canvas';

export type WiggersSide = 'left' | 'right';

interface Props {
  side: WiggersSide;
  height: number;
}

/** Indici (assoluti) degli ultimi due QRS completi nel buffer, o null. */
function findBeat(): [number, number] | null {
  const head = sampleBuffer.head;
  const oldest = Math.max(0, head - 3000 + 1);
  let q2 = -1;
  for (let i = head - 1; i > oldest; i--) {
    const cur = sampleBuffer.get(i, F.tQRS);
    const prev = sampleBuffer.get(i - 1, F.tQRS);
    if (cur >= 0 && cur < prev) {
      if (q2 < 0) q2 = i;
      else return [i, q2];
    }
  }
  return null;
}

interface Channel {
  field: number;
  color: string;
  label: string;
}

const PHASES = ['CI', 'Eiezione', 'RI', 'Riempimento rapido', 'Diastasi', 'Sistole atriale'] as const;
const SHORT = ['CI', 'Eiez.', 'RI', 'Riemp.', 'Diast.', 'Sist. A'] as const;

/**
 * Diagramma di Wiggers dell'ultimo battito completo: pressioni (Ao/VS/AS oppure AP/VD/AD), volume
 * ventricolare, ECG e fonocardiogramma, con eventi valvolari e fasi del ciclo cardiaco.
 */
export function WiggersDiagram({ side, height }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const g = canvas?.getContext('2d');
    if (!canvas || !g) return;
    const L = side === 'left';
    const pressures: Channel[] = L
      ? [
          { field: F.pAo, color: resolveColor('var(--abp)'), label: 'Aorta' },
          { field: F.pLV, color: '#f2f5f9', label: 'VS' },
          { field: F.pLA, color: resolveColor('var(--pcwp)'), label: 'AS' },
        ]
      : [
          { field: F.pPA, color: resolveColor('var(--pap)'), label: 'A. polmonare' },
          { field: F.pRV, color: '#f2f5f9', label: 'VD' },
          { field: F.pRA, color: resolveColor('var(--cvp)'), label: 'AD' },
        ];
    const vField = L ? F.vLV : F.vRV;
    const inflow = L ? F.qMV : F.qTV;
    const outflow = L ? F.qAV : F.qPV;
    const names = L ? ['M', 'Ao'] : ['T', 'P'];
    let raf = 0;
    let drawnQ1 = -1;
    let lastW = 0;

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const beat = findBeat();
      const { w, h } = fitCanvas(canvas, g);
      if (!beat) return;
      const [q1, q2] = beat;
      const pre = Math.round(0.08 * SAMPLE_RATE);
      const post = Math.round(0.06 * SAMPLE_RATE);
      if (q2 + post > sampleBuffer.head) return;
      if (q1 === drawnQ1 && w === lastW) return;
      drawnQ1 = q1;
      lastW = w;
      const i0 = Math.max(q1 - pre, sampleBuffer.head - 2999);
      const i1 = q2 + post;
      const n = i1 - i0;

      g.clearRect(0, 0, w, h);
      const left = 34;
      const right = w - 8;
      const top = 22;
      const pw = right - left;
      const x = (i: number) => left + ((i - i0) / n) * pw;
      // Altezze dei pannelli: pressioni, volume, ECG, fono
      const hs = [0.5, 0.2, 0.14, 0.16].map((f) => f * (h - top - 16));
      const ys: number[] = [];
      let acc = top;
      for (const hh of hs) {
        ys.push(acc);
        acc += hh;
      }

      // Eventi valvolari
      let inClose = -1;
      let outOpen = -1;
      let outClose = -1;
      let inOpen = -1;
      for (let i = q1; i < q2; i++) {
        const qi = sampleBuffer.get(i, inflow);
        const qo = sampleBuffer.get(i, outflow);
        const qiPrev = sampleBuffer.get(i - 1, inflow);
        const qoPrev = sampleBuffer.get(i - 1, outflow);
        if (inClose < 0 && qiPrev > 0 && qi <= 0) inClose = i;
        if (outOpen < 0 && qoPrev <= 0 && qo > 0) outOpen = i;
        if (outOpen > 0 && outClose < 0 && qoPrev > 0 && qo <= 0) outClose = i;
        if (outClose > 0 && inOpen < 0 && qiPrev <= 0 && qi > 0) inOpen = i;
      }
      if (inClose < 0) inClose = q1;
      // Fine del riempimento rapido e inizio della sistole atriale
      let ePeak = 0;
      let diastasis = -1;
      let atrial = -1;
      if (inOpen > 0) {
        for (let i = inOpen; i < q2; i++) {
          const qi = sampleBuffer.get(i, inflow);
          if (qi > ePeak) ePeak = qi;
          if (diastasis < 0 && ePeak > 0 && qi < 0.3 * ePeak && i > inOpen + 10) diastasis = i;
          if (atrial < 0 && sampleBuffer.get(i, F.eA) > 0.05) atrial = i;
        }
      }

      // Bande delle fasi
      const bounds = [inClose, outOpen, outClose, inOpen, diastasis, atrial, q2 + (inClose - q1)];
      const bandColors = ['#4da3ff', '#ff4d4d', '#4da3ff', '#3ddc84', '#8a96a8', '#ff9f43'];
      g.font = '10px -apple-system, system-ui, sans-serif';
      g.textBaseline = 'top';
      g.textAlign = 'center';
      for (let k = 0; k < PHASES.length; k++) {
        const a = bounds[k]!;
        let b = -1;
        for (let j = k + 1; j < bounds.length; j++) {
          if (bounds[j]! > 0) {
            b = bounds[j]!;
            break;
          }
        }
        if (a <= 0 || b <= a) continue;
        const xa = x(a);
        const xb = Math.min(x(b), right);
        g.fillStyle = bandColors[k]! + '1f';
        g.fillRect(xa, top, xb - xa, h - top - 16);
        g.fillStyle = bandColors[k]!;
        const label = xb - xa > g.measureText(PHASES[k]!).width + 4 ? PHASES[k]! : SHORT[k]!;
        if (xb - xa > 12) g.fillText(label, (xa + xb) / 2, 4);
      }

      // Linee degli eventi valvolari
      const events: [number, string][] = [
        [inClose, `chiusura ${names[0]}`],
        [outOpen, `apertura ${names[1]}`],
        [outClose, `chiusura ${names[1]}`],
        [inOpen, `apertura ${names[0]}`],
      ];
      g.setLineDash([3, 3]);
      g.strokeStyle = 'rgba(255,255,255,0.35)';
      for (const [i] of events) {
        if (i <= 0) continue;
        g.beginPath();
        g.moveTo(x(i), top);
        g.lineTo(x(i), h - 16);
        g.stroke();
      }
      g.setLineDash([]);

      const trace = (
        field: number,
        y: number,
        hh: number,
        lo: number,
        hi: number,
        color: string,
        lw = 1.6,
      ) => {
        g.strokeStyle = color;
        g.lineWidth = lw;
        g.beginPath();
        for (let i = i0; i < i1; i++) {
          const v = sampleBuffer.get(i, field);
          const py = y + hh - ((v - lo) / (hi - lo)) * hh;
          if (i === i0) g.moveTo(x(i), py);
          else g.lineTo(x(i), py);
        }
        g.stroke();
      };
      const range = (field: number): [number, number] => {
        let mn = Infinity;
        let mx = -Infinity;
        for (let i = i0; i < i1; i++) {
          const v = sampleBuffer.get(i, field);
          if (v < mn) mn = v;
          if (v > mx) mx = v;
        }
        return [mn, mx];
      };
      const label = (text: string, y: number, color: string) => {
        g.fillStyle = color;
        g.textAlign = 'left';
        g.textBaseline = 'top';
        g.font = '600 10px -apple-system, system-ui, sans-serif';
        g.fillText(text, left + 3, y + 2);
      };
      const scaleText = (v: number, y: number) => {
        g.fillStyle = 'rgba(200,210,225,0.6)';
        g.font = '9px -apple-system, system-ui, sans-serif';
        g.textAlign = 'right';
        g.textBaseline = 'middle';
        g.fillText(Math.round(v).toString(), left - 3, y);
      };

      // Pannello pressioni
      let pmax = 0;
      let pmin = 0;
      for (const c of pressures) {
        const [mn, mx] = range(c.field);
        pmax = Math.max(pmax, mx);
        pmin = Math.min(pmin, mn);
      }
      const step = niceStep(pmax, 4);
      const hi = niceCeil(pmax * 1.05, step);
      const lo = pmin < 0 ? -niceCeil(-pmin, 5) : 0;
      g.strokeStyle = 'rgba(255,255,255,0.07)';
      g.lineWidth = 1;
      for (let v = 0; v <= hi + 1e-6; v += step) {
        const py = ys[0]! + hs[0]! - ((v - lo) / (hi - lo)) * hs[0]!;
        g.beginPath();
        g.moveTo(left, py);
        g.lineTo(right, py);
        g.stroke();
        scaleText(v, py);
      }
      for (const c of pressures)
        trace(c.field, ys[0]!, hs[0]!, lo, hi, c.color, c.label.startsWith('V') ? 2 : 1.6);
      let lx = left + 3;
      g.font = '600 10px -apple-system, system-ui, sans-serif';
      g.textAlign = 'left';
      g.textBaseline = 'top';
      for (const c of pressures) {
        g.fillStyle = c.color;
        g.fillText(c.label, lx, ys[0]! + 2);
        lx += g.measureText(c.label).width + 10;
      }
      g.fillStyle = 'rgba(200,210,225,0.6)';
      g.fillText('mmHg', lx, ys[0]! + 2);

      // Volume
      const [vmin, vmax] = range(vField);
      const vpad = Math.max(5, (vmax - vmin) * 0.1);
      trace(vField, ys[1]!, hs[1]!, vmin - vpad, vmax + vpad, '#b18cff', 1.8);
      label(`Volume ${L ? 'VS' : 'VD'} (mL)`, ys[1]!, '#b18cff');
      scaleText(vmax, ys[1]! + hs[1]! * (vpad / (vmax - vmin + 2 * vpad)));
      scaleText(vmin, ys[1]! + hs[1]! * (1 - vpad / (vmax - vmin + 2 * vpad)));

      // ECG
      trace(F.ecg, ys[2]!, hs[2]!, -0.5, 1.4, resolveColor('var(--ecg)'), 1.5);
      label('ECG', ys[2]!, resolveColor('var(--ecg)'));

      // Fono
      const [fmin, fmax] = range(F.phono);
      const fa = Math.max(Math.abs(fmin), Math.abs(fmax), 0.5);
      trace(F.phono, ys[3]!, hs[3]!, -fa, fa, '#c5ceda', 1);
      label('Fono', ys[3]!, '#c5ceda');
      // Etichette dei toni
      g.fillStyle = '#c5ceda';
      g.font = '600 10px -apple-system, system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'bottom';
      if (inClose > 0) g.fillText('S1', x(inClose) + 8, ys[3]! + hs[3]! + 12);
      if (outClose > 0) g.fillText('S2', x(outClose) + 8, ys[3]! + hs[3]! + 12);

      // Asse temporale (ms dal QRS)
      g.fillStyle = 'rgba(200,210,225,0.6)';
      g.font = '9px -apple-system, system-ui, sans-serif';
      g.textBaseline = 'bottom';
      for (let ms = 0; ; ms += 200) {
        const i = q1 + (ms / 1000) * SAMPLE_RATE;
        if (i > i1) break;
        g.fillText(`${ms}`, x(i), h);
      }
      g.textAlign = 'right';
      g.fillText('ms', right, h);
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
