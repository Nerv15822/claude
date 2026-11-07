import { describe, expect, it } from 'vitest';
import { CardioEngine, DT, defaultParams } from '../../src/engine';

/** Fase 1 — bilancio di volume conservato e integratore stabile. */
describe('Emodinamica · conservazione del volume', () => {
  it('senza infusione il volume ematico totale è conservato', () => {
    const p = defaultParams();
    const engine = new CardioEngine(p);
    engine.run(10); // transitorio iniziale (l'infusione porta al target)
    const v0 = engine.totalVolume();
    // Allinea il target al volume corrente: nessuna infusione netta.
    engine.params.bloodVolume = v0;
    engine.effParams.bloodVolume = v0;
    engine.run(30);
    const v1 = engine.totalVolume();
    expect(Math.abs(v1 - v0)).toBeLessThan(0.5); // < 0.5 mL su 30 s
  });

  it("l'infusione porta la volemia al target conservando la massa a ogni passo", () => {
    const p = defaultParams();
    p.bloodVolume = 5000;
    const engine = new CardioEngine(p);
    engine.run(20);
    engine.params.bloodVolume = 5600;
    engine.effParams.bloodVolume = 5600;
    engine.run(40);
    expect(engine.totalVolume()).toBeGreaterThan(5550);
    expect(engine.totalVolume()).toBeLessThanOrEqual(5601);
  });
});

describe('Emodinamica · stabilità dell’integratore', () => {
  it('nessun NaN/Inf e stato limitato su una lunga simulazione', () => {
    const engine = new CardioEngine(defaultParams());
    engine.run(120);
    for (let i = 0; i < engine.y.length; i++) {
      expect(Number.isFinite(engine.y[i]!)).toBe(true);
    }
    const b = engine.currentBeat;
    expect(b.co).toBeGreaterThan(2);
    expect(b.co).toBeLessThan(12);
    expect(b.map).toBeGreaterThan(40);
    expect(b.map).toBeLessThan(200);
  });

  it('stabile a frequenza alta (FC 160) e con VPP + PEEP', () => {
    const p = defaultParams();
    p.rhythm.hr = 160;
    p.ventilation.mode = 'ppv';
    p.ventilation.peep = 12;
    const engine = new CardioEngine(p);
    engine.run(60);
    for (let i = 0; i < engine.y.length; i++) expect(Number.isFinite(engine.y[i]!)).toBe(true);
    const b = engine.currentBeat;
    expect(b.hr).toBeGreaterThan(140);
    expect(b.co).toBeGreaterThan(2);
    expect(b.map).toBeGreaterThan(40);
  });

  it('il passo di integrazione è 1 ms', () => {
    expect(DT).toBeCloseTo(0.001, 6);
  });
});
