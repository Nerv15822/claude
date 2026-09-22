import { describe, expect, it } from 'vitest';
import { computeStarlingCurve } from '../../src/physiology/analysis';
import { ecgValue, qtInterval } from '../../src/physiology/ecg';
import { CardioEngine, F, SAMPLE_SIZE } from '../../src/physiology/engine';
import { defaultParams, type ParamsPatch } from '../../src/physiology/params';

/** Registra i campioni di fono ed ECG per `seconds` dopo un transitorio. */
function record(patch: ParamsPatch, seconds = 4) {
  const e = new CardioEngine();
  e.setParams({ ventilation: { mode: 'apnea' }, ...patch });
  e.advance(25);
  const s = new Float64Array(SAMPLE_SIZE);
  let maxPhono = 0;
  let murmurSamples = 0;
  let maxEcg = -Infinity;
  const n = Math.round(seconds / e.dt);
  for (let i = 0; i < n; i++) {
    e.step();
    e.writeSample(s, 0);
    maxPhono = Math.max(maxPhono, Math.abs(s[F.phono]!));
    if (e.phono.murmur > 0.05) murmurSamples++;
    maxEcg = Math.max(maxEcg, s[F.ecg]!);
  }
  return { maxPhono, murmurFraction: murmurSamples / n, maxEcg, engine: e };
}

describe('ECG sintetico', () => {
  it('onda R ~1.2 mV a 30 ms dal QRS, P presente in ritmo sinusale', () => {
    const base = { t: 0, tP: -1, rr: 0.857, rhythm: 'sinus' as const };
    expect(ecgValue({ ...base, tQRS: 0.03 })).toBeGreaterThan(1.1);
    expect(ecgValue({ ...base, tQRS: 0.5, tP: 0.05 })).toBeGreaterThan(0.1);
  });
  it('QT si accorcia con la frequenza (Bazett)', () => {
    expect(qtInterval(0.5)).toBeLessThan(qtInterval(1));
  });
  it('in FA non ci sono onde P', () => {
    const v = ecgValue({ t: 0, tP: 0.05, tQRS: 0.6, rr: 0.8, rhythm: 'af' });
    expect(Math.abs(v)).toBeLessThan(0.1);
  });
  it("l'ECG del motore contiene i QRS", () => {
    expect(record({}).maxEcg).toBeGreaterThan(1);
  });
});

describe('fonocardiogramma', () => {
  it('cuore normale: toni presenti, nessun soffio', () => {
    const r = record({});
    expect(r.maxPhono).toBeGreaterThan(0.3);
    expect(r.murmurFraction).toBe(0);
  });
  it('stenosi aortica severa: soffio sistolico', () => {
    expect(record({ aortic: { area: 0.7 } }).murmurFraction).toBeGreaterThan(0.1);
  });
  it('insufficienza mitralica: soffio', () => {
    expect(record({ mitral: { regurgitantArea: 0.4 } }).murmurFraction).toBeGreaterThan(0.1);
  });
});

describe('curva di Frank-Starling', () => {
  it('monotona crescente con la PTD, appiattita se ↓ contrattilità', () => {
    const normal = computeStarlingCurve(defaultParams());
    for (let i = 1; i < normal.length; i++) {
      expect(normal[i]!.lvEdp).toBeGreaterThan(normal[i - 1]!.lvEdp);
      expect(normal[i]!.sv).toBeGreaterThan(normal[i - 1]!.sv);
    }
    const p = defaultParams();
    p.lv.ees = 1.0;
    const hf = computeStarlingCurve(p);
    expect(hf[hf.length - 1]!.sv).toBeLessThan(normal[normal.length - 1]!.sv * 0.75);
  });
});
