import { describe, expect, it } from 'vitest';
import { CardioEngine } from '../../src/physiology/engine';
import { bernoulliCoefficient } from '../../src/physiology/units';
import { steady } from './helpers';

describe('invarianti numeriche', () => {
  it('conservazione della massa: volume totale costante', () => {
    const e = new CardioEngine();
    const v0 = e.totalVolume();
    e.advance(30);
    expect(Math.abs(e.totalVolume() - v0)).toBeLessThan(1e-6);
    for (const x of e.y) expect(Number.isFinite(x)).toBe(true);
  });

  it('la volemia target viene raggiunta gradualmente (infusione limitata)', () => {
    const e = new CardioEngine();
    e.setParams({ bloodVolume: 5500 });
    e.advance(5);
    const partial = e.totalVolume();
    expect(partial).toBeGreaterThan(5050);
    expect(partial).toBeLessThan(5200); // ≤ 25 mL/s
    e.advance(40);
    expect(Math.abs(e.totalVolume() - 5500)).toBeLessThan(0.1);
  });

  it('convergenza: dimezzando dt i risultati cambiano < 1 %', () => {
    const a = steady({ ventilation: { mode: 'apnea' } }, 30, 5, 0.0005).beat;
    const b = steady({ ventilation: { mode: 'apnea' } }, 30, 5, 0.00025).beat;
    for (const k of ['aoSys', 'aoDia', 'co', 'lvEdv', 'paMean', 'raMean'] as const) {
      expect(Math.abs(a[k] - b[k]) / Math.abs(b[k])).toBeLessThan(0.01);
    }
  });

  it('regime periodico in apnea: battiti consecutivi identici', () => {
    const e = new CardioEngine();
    e.setParams({ ventilation: { mode: 'apnea' } });
    e.advance(40);
    const n = e.beatCount;
    while (e.beatCount === n) e.step();
    const first = { ...e.lastBeat };
    const n2 = e.beatCount;
    while (e.beatCount === n2) e.step();
    expect(Math.abs(e.lastBeat.aoSys - first.aoSys)).toBeLessThan(0.05);
    expect(Math.abs(e.lastBeat.lvEdv - first.lvEdv)).toBeLessThan(0.05);
  });

  it('Bernoulli: A = 1 cm², Q = 250 mL/s → ΔP ≈ 4v² ≈ 25 mmHg', () => {
    expect(bernoulliCoefficient(1) * 250 * 250).toBeCloseTo(24.8, 0);
  });
});
