import { beforeAll, describe, expect, it } from 'vitest';
import type { BeatMetrics } from '../../src/physiology/metrics';
import { steady } from './helpers';

/** Validazione del caso normale a regime contro i valori di riferimento (vedi CLAUDE.md). */
describe('caso normale a regime (FC 70, respiro spontaneo)', () => {
  let b: BeatMetrics;
  beforeAll(() => {
    b = steady().beat;
  });

  const within = (x: number, lo: number, hi: number) => {
    expect(x).toBeGreaterThanOrEqual(lo);
    expect(x).toBeLessThanOrEqual(hi);
  };

  it('pressione aortica 120/80 ± 10 mmHg', () => {
    within(b.aoSys, 110, 130);
    within(b.aoDia, 70, 90);
  });
  it('VS 120 / telediastolica 4–10 mmHg', () => {
    within(b.lvSys, 110, 135);
    within(b.lvEdp, 4, 10);
  });
  it('AS media 6–12 mmHg (≈ PCWP)', () => within(b.laMean, 6, 12));
  it('AD media 2–6 mmHg (CVP)', () => within(b.raMean, 2, 6));
  it('VD 25 / 2–6 mmHg', () => {
    within(b.rvSys, 20, 30);
    within(b.rvEdp, 2, 6);
  });
  it('AP 25/10, media 12–18 mmHg', () => {
    within(b.paSys, 20, 30);
    within(b.paDia, 7, 13);
    within(b.paMean, 12, 18);
  });
  it('GC 4.5–6 L/min a FC 70', () => {
    within(b.hr, 69, 71);
    within(b.co, 4.5, 6);
  });
  it('FE 55–65 %', () => within(b.ef, 0.55, 0.65));
  it('VTD VS 120–140 mL', () => within(b.lvEdv, 120, 140));
  it('valvole normali: gradienti bassi, nessun rigurgito', () => {
    expect(b.avMeanGradient).toBeLessThan(5);
    expect(b.mvMeanGradient).toBeLessThan(4);
    expect(b.mrFraction).toBe(0);
    expect(b.arFraction).toBe(0);
  });
  it('SvO2 65–78 % (Fick)', () => within(b.svo2, 0.65, 0.78));
  it('Qp/Qs = 1 senza shunt', () => within(b.qpqs, 0.98, 1.02));
});
