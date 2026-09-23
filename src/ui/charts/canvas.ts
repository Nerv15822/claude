/** Utilità comuni per i grafici su canvas 2D (DPR, colori, scale). */

/** Adatta il canvas alla dimensione CSS e al DPR; ritorna le dimensioni CSS. */
export function fitCanvas(
  canvas: HTMLCanvasElement,
  g: CanvasRenderingContext2D,
  maxDpr = 2,
): { w: number; h: number } {
  const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  const pw = Math.round(w * dpr);
  const ph = Math.round(h * dpr);
  if (canvas.width !== pw || canvas.height !== ph) {
    canvas.width = pw;
    canvas.height = ph;
  }
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { w, h };
}

const colorCache = new Map<string, string>();
/** Risolve `var(--nome)` in un colore utilizzabile dal canvas. */
export function resolveColor(color: string): string {
  const m = /^var\((--[\w-]+)\)$/.exec(color);
  if (!m?.[1]) return color;
  const cached = colorCache.get(m[1]);
  if (cached) return cached;
  const v = getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim() || '#ffffff';
  colorCache.set(m[1], v);
  return v;
}

/** Passo "rotondo" per le tacche degli assi. */
export function niceStep(range: number, targetTicks = 5): number {
  const raw = range / targetTicks;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / mag;
  const f = n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10;
  return f * mag;
}

/** Estremo superiore arrotondato per un fondo scala automatico. */
export function niceCeil(x: number, step: number): number {
  return Math.ceil(x / step) * step;
}

export interface Axes {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  /** Area di disegno in px CSS */
  left: number;
  top: number;
  width: number;
  height: number;
}

export const toX = (a: Axes, x: number) => a.left + ((x - a.x0) / (a.x1 - a.x0)) * a.width;
export const toY = (a: Axes, y: number) => a.top + a.height - ((y - a.y0) / (a.y1 - a.y0)) * a.height;

/** Disegna griglia, tacche ed etichette degli assi. */
export function drawAxes(g: CanvasRenderingContext2D, a: Axes, xLabel: string, yLabel: string): void {
  g.save();
  g.font = '10px -apple-system, system-ui, sans-serif';
  g.fillStyle = 'rgba(200,210,225,0.7)';
  g.strokeStyle = 'rgba(255,255,255,0.07)';
  g.lineWidth = 1;
  const sx = niceStep(a.x1 - a.x0, Math.max(3, Math.floor(a.width / 70)));
  const sy = niceStep(a.y1 - a.y0, Math.max(3, Math.floor(a.height / 40)));
  g.textAlign = 'center';
  g.textBaseline = 'top';
  for (let x = Math.ceil(a.x0 / sx) * sx; x <= a.x1 + 1e-9; x += sx) {
    const px = toX(a, x);
    g.beginPath();
    g.moveTo(px, a.top);
    g.lineTo(px, a.top + a.height);
    g.stroke();
    g.fillText(fmt(x), px, a.top + a.height + 3);
  }
  g.textAlign = 'right';
  g.textBaseline = 'middle';
  for (let y = Math.ceil(a.y0 / sy) * sy; y <= a.y1 + 1e-9; y += sy) {
    const py = toY(a, y);
    g.beginPath();
    g.moveTo(a.left, py);
    g.lineTo(a.left + a.width, py);
    g.stroke();
    g.fillText(fmt(y), a.left - 4, py);
  }
  g.strokeStyle = 'rgba(255,255,255,0.25)';
  g.strokeRect(a.left, a.top, a.width, a.height);
  g.textAlign = 'center';
  g.textBaseline = 'bottom';
  g.fillText(xLabel, a.left + a.width / 2, a.top + a.height + 28);
  g.translate(10, a.top + a.height / 2);
  g.rotate(-Math.PI / 2);
  g.textBaseline = 'top';
  g.fillText(yLabel, 0, -6);
  g.restore();
}

const fmt = (v: number) => (Math.abs(v) >= 10 || v === 0 ? Math.round(v).toString() : v.toFixed(1));
