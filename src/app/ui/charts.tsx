import { useEffect, useRef } from 'react';
import { SAMPLE, SAMPLE_STRIDE } from '../worker/protocol';
import { getSamples, useStore } from '../store';

const DPR = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio : 1, 2);

/** Prepara il canvas HiDPI e restituisce il contesto e le dimensioni CSS. */
function prep(
  canvas: HTMLCanvasElement,
  cssH: number,
): { ctx: CanvasRenderingContext2D; w: number; h: number } | null {
  const w = canvas.clientWidth || 300;
  const h = cssH;
  if (canvas.width !== Math.round(w * DPR) || canvas.height !== Math.round(h * DPR)) {
    canvas.width = Math.round(w * DPR);
    canvas.height = Math.round(h * DPR);
    canvas.style.height = `${h}px`;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return { ctx, w, h };
}

function useLoop(draw: () => void) {
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      draw();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

const INK = '#15202b';
const MUTED = '#9aa6b6';
const GRID = '#e2e7f0';

/** Tracciato scorrevole: pressione aortica (rosso) e arteria polmonare (ciano). */
export function StripTrace() {
  const ref = useRef<HTMLCanvasElement>(null);
  useLoop(() => {
    const c = ref.current;
    if (!c) return;
    const p = prep(c, 120);
    if (!p) return;
    const { ctx, w, h } = p;
    const { buffer, count } = getSamples();
    const pad = 4;
    const yMax = 160;
    const y = (v: number) => h - pad - (Math.max(0, Math.min(v, yMax)) / yMax) * (h - 2 * pad);
    // griglia
    ctx.strokeStyle = GRID;
    ctx.lineWidth = 1;
    for (const g of [40, 80, 120]) {
      ctx.beginPath();
      ctx.moveTo(0, y(g));
      ctx.lineTo(w, y(g));
      ctx.stroke();
      ctx.fillStyle = MUTED;
      ctx.font = '9px -apple-system, sans-serif';
      ctx.fillText(String(g), 2, y(g) - 2);
    }
    if (count < 2) return;
    const x = (i: number) => (i / (count - 1)) * w;
    const line = (field: number, color: string) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < count; i++) {
        const v = buffer[i * SAMPLE_STRIDE + field]!;
        const px = x(i);
        const py = y(v);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    };
    line(SAMPLE.ppa, '#16a0ad');
    line(SAMPLE.pao, '#e23d2f');
  });
  return <canvas ref={ref} className="em-chart" aria-label="Tracciato pressorio aortico e polmonare" />;
}

function pvLoop(
  canvas: HTMLCanvasElement,
  vField: number,
  pField: number,
  vMax: number,
  pMax: number,
  color: string,
  label: string,
) {
  const p = prep(canvas, 150);
  if (!p) return;
  const { ctx, w, h } = p;
  const padL = 26,
    padB = 16,
    padT = 8,
    padR = 6;
  const x = (v: number) => padL + (Math.max(0, Math.min(v, vMax)) / vMax) * (w - padL - padR);
  const y = (pp: number) => h - padB - (Math.max(0, Math.min(pp, pMax)) / pMax) * (h - padB - padT);
  ctx.strokeStyle = GRID;
  ctx.lineWidth = 1;
  ctx.fillStyle = MUTED;
  ctx.font = '9px -apple-system, sans-serif';
  for (let g = 0; g <= pMax; g += pMax / 4) {
    ctx.beginPath();
    ctx.moveTo(padL, y(g));
    ctx.lineTo(w - padR, y(g));
    ctx.stroke();
    ctx.fillText(String(Math.round(g)), 2, y(g) + 3);
  }
  ctx.fillStyle = INK;
  ctx.fillText(label, padL + 2, padT + 8);
  const { buffer, count } = getSamples();
  if (count < 2) return;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  for (let i = 0; i < count; i++) {
    const v = buffer[i * SAMPLE_STRIDE + vField]!;
    const pp = buffer[i * SAMPLE_STRIDE + pField]!;
    const px = x(v);
    const py = y(pp);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();
  ctx.fillStyle = MUTED;
  ctx.fillText('mL', w - padR - 16, h - 4);
}

export function PVLoops() {
  const lv = useRef<HTMLCanvasElement>(null);
  const rv = useRef<HTMLCanvasElement>(null);
  useLoop(() => {
    if (lv.current) pvLoop(lv.current, SAMPLE.vlv, SAMPLE.plv, 180, 160, '#e23d2f', 'VS');
    if (rv.current) pvLoop(rv.current, SAMPLE.vrv, SAMPLE.prv, 180, 50, '#3b74ff', 'VD');
  });
  return (
    <div className="em-two">
      <canvas ref={lv} className="em-chart" aria-label="Loop pressione-volume del ventricolo sinistro" />
      <canvas ref={rv} className="em-chart" aria-label="Loop pressione-volume del ventricolo destro" />
    </div>
  );
}

/** Diagramma di Guyton: ritorno venoso × funzione cardiaca, intersezione = punto di lavoro. */
export function GuytonDiagram() {
  const ref = useRef<HTMLCanvasElement>(null);
  useLoop(() => {
    const c = ref.current;
    const beat = useStore.getState().beat;
    if (!c || !beat) return;
    const p = prep(c, 160);
    if (!p) return;
    const { ctx, w, h } = p;
    const padL = 28,
      padB = 20,
      padT = 10,
      padR = 8;
    const rapMin = -4,
      rapMax = 14,
      coMax = 12;
    const X = (rap: number) => padL + ((rap - rapMin) / (rapMax - rapMin)) * (w - padL - padR);
    const Y = (co: number) => h - padB - (Math.max(0, Math.min(co, coMax)) / coMax) * (h - padB - padT);

    ctx.strokeStyle = GRID;
    ctx.fillStyle = MUTED;
    ctx.font = '9px -apple-system, sans-serif';
    ctx.lineWidth = 1;
    for (let co = 0; co <= coMax; co += 3) {
      ctx.beginPath();
      ctx.moveTo(padL, Y(co));
      ctx.lineTo(w - padR, Y(co));
      ctx.stroke();
      ctx.fillText(String(co), 4, Y(co) + 3);
    }
    ctx.beginPath();
    ctx.moveTo(X(0), padT);
    ctx.lineTo(X(0), h - padB);
    ctx.stroke();

    const msfp = Math.max(beat.msfp, 1);
    const rap = beat.cvp;
    const co = beat.co;

    // Curva di ritorno venoso: lineare, VR=0 a RAP=MSFP, passa per (RAP, CO).
    const denom = rap - msfp || -0.1;
    const vr = (r: number) => (co * (r - msfp)) / denom;
    ctx.strokeStyle = '#3b74ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(X(rapMin), Y(Math.max(0, vr(rapMin))));
    ctx.lineTo(X(msfp), Y(0));
    ctx.stroke();

    // Curva di funzione cardiaca: saturante, passa per (RAP, CO).
    const rap0 = -5;
    const comax = Math.max(co * 1.7, 3);
    const kcf = (rap - rap0) * (comax / Math.max(co, 0.1) - 1);
    const cf = (r: number) => (r <= rap0 ? 0 : (comax * (r - rap0)) / (kcf + (r - rap0)));
    ctx.strokeStyle = '#e23d2f';
    ctx.beginPath();
    for (let r = rapMin; r <= rapMax; r += 0.4) {
      const px = X(r);
      const py = Y(cf(r));
      if (r === rapMin) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // Punto di lavoro (intersezione).
    ctx.fillStyle = '#15202b';
    ctx.beginPath();
    ctx.arc(X(rap), Y(co), 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = MUTED;
    ctx.fillText('RAP (mmHg) →', w - 92, h - 6);
    ctx.fillStyle = '#3b74ff';
    ctx.fillText('ritorno venoso', padL + 2, h - padB - 4);
    ctx.fillStyle = '#e23d2f';
    ctx.fillText('funzione cardiaca', padL + 2, padT + 10);
  });
  return <canvas ref={ref} className="em-chart" aria-label="Diagramma di Guyton" />;
}
