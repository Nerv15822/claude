import { describe, expect, it } from 'vitest';
import { steady } from './helpers';

const withReflex = { reflex: { enabled: true } };

describe('baroriflesso', () => {
  it('al punto di equilibrio normale non modifica i valori basali', () => {
    const a = steady(withReflex).beat;
    const b = steady().beat;
    expect(Math.abs(a.aoMean - b.aoMean)).toBeLessThan(1.5);
    expect(Math.abs(a.hr - b.hr)).toBeLessThan(1.5);
  });
  it('emorragia: tachicardia e vasocostrizione compensatorie limitano la caduta pressoria', () => {
    const noReflex = steady({ bloodVolume: 4000 }).beat;
    const reflex = steady({ ...withReflex, bloodVolume: 4000 }).beat;
    expect(reflex.hr).toBeGreaterThan(noReflex.hr + 10);
    expect(reflex.svr).toBeGreaterThan(noReflex.svr);
    expect(reflex.aoMean).toBeGreaterThan(noReflex.aoMean + 8);
  });
  it('vasocostrizione pura: bradicardia riflessa', () => {
    const b = steady({ ...withReflex, systemic: { r: 1.6 } }).beat;
    expect(b.hr).toBeLessThan(66);
  });
});

describe('farmaci (effetto a regime, con riflessi)', () => {
  const base = () => steady(withReflex, 40, 10).beat;
  const drug = (d: Record<string, number>) => steady({ ...withReflex, drugs: d }, 400, 10).beat;
  it('noradrenalina: ↑ PAM e ↑ RVS', () => {
    const b0 = base();
    const b = drug({ noradrenaline: 0.3 });
    expect(b.aoMean).toBeGreaterThan(b0.aoMean + 15);
    expect(b.svr).toBeGreaterThan(b0.svr * 1.3);
  });
  it('dobutamina: ↑ FE e ↑ GC', () => {
    const b0 = base();
    const b = drug({ dobutamine: 10 });
    expect(b.ef).toBeGreaterThan(b0.ef + 0.05);
    expect(b.co).toBeGreaterThan(b0.co);
  });
  it('nitroglicerina: ↓ precarico (PCWP, VTD)', () => {
    const b0 = base();
    const b = drug({ nitroglycerin: 2 });
    expect(b.laMean).toBeLessThan(b0.laMean - 1);
    expect(b.lvEdv).toBeLessThan(b0.lvEdv);
  });
  it('esmololo: ↓ FC', () => {
    const b0 = base();
    const b = drug({ esmolol: 200 });
    expect(b.hr).toBeLessThan(b0.hr - 10);
  });
  it('stenosi aortica severa: vasodilatazione e tachicardia compromettono il bilancio O₂ subendocardico', () => {
    // Nella SA la postcarica è la valvola: ridurre le RVS abbassa la pressione diastolica
    // (apporto coronarico) senza ridurre la pressione sistolica del VS (domanda).
    const AS = { ...withReflex, aortic: { area: 0.5 }, lv: { lambda: 0.05 } };
    const dil = { systemic: { r: 0.97 * 0.65 } };
    const norm = base();
    const normDil = steady({ ...withReflex, ...dil }, 60, 10).beat;
    const as = steady(AS, 40, 10).beat;
    const asDil = steady({ ...AS, ...dil }, 60, 10).beat;
    const asTachy = steady({ ...AS, rhythm: { hr: 110 } }, 40, 10).beat;
    expect(as.evr).toBeLessThan(0.7 * norm.evr);
    expect(normDil.lvSys).toBeLessThan(norm.lvSys - 3);
    expect(asDil.lvSys).toBeGreaterThan(as.lvSys - 3);
    expect(asDil.evr / as.evr).toBeLessThan(normDil.evr / norm.evr);
    expect(asDil.evr).toBeLessThan(0.5);
    expect(asTachy.evr).toBeLessThan(as.evr * 0.85);
  });
});

describe('interventi', () => {
  it('bolo di 500 mL: ↑ VTD e GC in un paziente ipovolemico', () => {
    const { engine } = steady({ bloodVolume: 4200 });
    const before = { ...engine.lastBeat };
    engine.fluidBolus(500, 60);
    engine.advance(90);
    expect(engine.totalVolume()).toBeCloseTo(4700, 0);
    expect(engine.lastBeat.lvEdv).toBeGreaterThan(before.lvEdv + 5);
    expect(engine.lastBeat.co).toBeGreaterThan(before.co);
  });
  it('propofol: ↓ PAM con riflesso attenuato', () => {
    const { engine } = steady(withReflex);
    const map0 = engine.lastBeat.aoMean;
    engine.bolusPropofol(2);
    engine.advance(90);
    expect(engine.lastBeat.aoMean).toBeLessThan(map0 - 12);
  });
  it('IABP: aumento diastolico e riduzione della pressione telediastolica aortica', () => {
    const off = steady({ lv: { ees: 1.2 } }).engine;
    const on = steady({ lv: { ees: 1.2 }, iabp: { enabled: true, volume: 40 } }).engine;
    expect(on.lastBeat.aoMean).toBeGreaterThan(off.lastBeat.aoMean);
    expect(on.lastBeat.aoDia).toBeLessThan(off.lastBeat.aoDia);
  });
});
