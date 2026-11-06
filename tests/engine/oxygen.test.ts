import { describe, expect, it } from 'vitest';
import { buildRx, dose, snap } from './pharm-helpers';

/** Fase 3 — trasporto di ossigeno. */
describe('Emodinamica · trasporto di O₂', () => {
  it('valori a riposo fisiologici (SvO₂, O₂ER, DO₂, SpO₂)', () => {
    const { engine, mod } = buildRx();
    const { oxygen } = mod.assess(engine);
    expect(oxygen.svo2).toBeGreaterThanOrEqual(0.63);
    expect(oxygen.svo2).toBeLessThanOrEqual(0.78);
    expect(oxygen.o2er).toBeGreaterThanOrEqual(0.2);
    expect(oxygen.o2er).toBeLessThanOrEqual(0.33);
    expect(oxygen.do2).toBeGreaterThanOrEqual(850);
    expect(oxygen.do2).toBeLessThanOrEqual(1150);
    expect(oxygen.cao2).toBeGreaterThanOrEqual(16);
    expect(oxygen.cao2).toBeLessThanOrEqual(20);
    expect(oxygen.spo2).toBeGreaterThanOrEqual(0.95);
    expect(oxygen.lactate).toBeLessThan(1.5);
    expect(oxygen.evr).toBeGreaterThan(0.7);
  });

  it('CONCETTO CENTRALE: un vasocostrittore puro alza la MAP mentre la DO₂ CALA', () => {
    const { engine, mod } = buildRx();
    const o0 = mod.assess(engine).oxygen;
    const map0 = snap(engine.currentBeat).map;
    dose(engine, mod, { phenylephrine: 2 });
    const o1 = mod.assess(engine).oxygen;
    const map1 = engine.currentBeat.map;
    expect(map1).toBeGreaterThan(map0 + 5); // MAP in aumento
    expect(o1.do2).toBeLessThan(o0.do2 - 100); // DO₂ in calo
    expect(o1.svo2).toBeLessThan(o0.svo2); // estrazione periferica aumentata
  });

  it('ipovolemia grave: DO₂ ↓, SvO₂ ↓, estrazione ↑', () => {
    const { engine, mod } = buildRx({ patch: { bloodVolume: 3300 } });
    const { oxygen } = mod.assess(engine);
    expect(oxygen.do2).toBeLessThan(750);
    expect(oxygen.svo2).toBeLessThan(0.62);
    expect(oxygen.o2er).toBeGreaterThan(0.35);
  });

  it('febbre: il VO₂ aumenta (Q10)', () => {
    const normo = buildRx();
    const febbre = buildRx({ metabolic: { temperature: 40 } });
    expect(febbre.mod.assess(febbre.engine).oxygen.vo2).toBeGreaterThan(
      normo.mod.assess(normo.engine).oxygen.vo2 + 30,
    );
  });

  it('i vasodilatatori inibiscono la HPV: shunt ↑ e SpO₂ ↓', () => {
    const { engine, mod } = buildRx();
    const o0 = mod.assess(engine).oxygen;
    dose(engine, mod, { nitroprusside: 5 });
    const o1 = mod.assess(engine).oxygen;
    expect(o1.shunt).toBeGreaterThan(o0.shunt + 0.03);
    expect(o1.spo2).toBeLessThan(o0.spo2);
  });

  it('la DO₂ per distretto somma alla DO₂ totale (tutta la gittata passa dai distretti)', () => {
    const { engine, mod } = buildRx();
    const { oxygen } = mod.assess(engine);
    const sum = oxygen.districtDo2.reduce((a, b) => a + b, 0);
    expect(Math.abs(sum - oxygen.do2) / oxygen.do2).toBeLessThan(0.05);
  });
});
