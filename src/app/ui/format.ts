/** Emodinamica — formattazione e unità cliniche per la UI. */
import { DISTRICT_KEYS } from '../../engine';

export const DISTRICT_LABEL: Record<(typeof DISTRICT_KEYS)[number], string> = {
  splanchnic: 'Splancnico',
  renal: 'Renale',
  muscle: 'Muscolare',
  skin: 'Cutaneo',
  coronary: 'Coronarico',
  cerebral: 'Cerebrale',
};

export function fmt(x: number | undefined, digits = 0): string {
  if (x === undefined || !Number.isFinite(x)) return '—';
  return x.toFixed(digits);
}

export type Direction = 'up' | 'down' | 'flat';

/** Direzione del delta rispetto al basale, con soglia relativa per evitare rumore. */
export function direction(now: number, base: number | undefined, rel = 0.03): Direction {
  if (base === undefined) return 'flat';
  const d = now - base;
  const thr = Math.max(Math.abs(base) * rel, 1e-6);
  if (d > thr) return 'up';
  if (d < -thr) return 'down';
  return 'flat';
}

export function deltaLabel(now: number, base: number | undefined, digits = 0): string {
  if (base === undefined) return '';
  const d = now - base;
  const arrow = d > 0 ? '▲' : d < 0 ? '▼' : '◦';
  return `${arrow} ${d >= 0 ? '+' : ''}${d.toFixed(digits)}`;
}

/** Slider logaritmico: t∈[0,1] → dose∈[0,max]. t≈0 → 0 (farmaco spento). */
export function sliderToDose(t: number, max: number): number {
  if (t <= 0.02) return 0;
  const floor = max / 400;
  const d = floor * Math.pow(max / floor, (t - 0.02) / 0.98);
  return Math.min(d, max);
}
export function doseToSlider(dose: number, max: number): number {
  if (dose <= 0) return 0;
  const floor = max / 400;
  const t = 0.02 + (0.98 * Math.log(dose / floor)) / Math.log(max / floor);
  return Math.max(0, Math.min(1, t));
}
