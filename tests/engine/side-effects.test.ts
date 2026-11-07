import { describe, expect, it } from 'vitest';
import type { Alert } from '../../src/engine';
import { buildRx, dose } from './pharm-helpers';

const has = (alerts: Alert[], id: string) => alerts.some((a) => a.id === id);
const get = (alerts: Alert[], id: string) => alerts.find((a) => a.id === id);

/** Fase 3 — effetti collaterali CALCOLATI dallo stato. */
describe('Emodinamica · effetti collaterali calcolati', () => {
  it('a riposo nessun avviso grave', () => {
    const { engine, mod } = buildRx();
    const { alerts } = mod.assess(engine);
    expect(alerts.every((a) => a.gravita !== 'grave')).toBe(true);
  });

  it('ogni avviso ha gravità, meccanismo e variabile generatrice', () => {
    const { engine, mod } = buildRx();
    dose(engine, mod, { adrenaline: 0.2 });
    const { alerts } = mod.assess(engine);
    expect(alerts.length).toBeGreaterThan(0);
    for (const a of alerts) {
      expect(['lieve', 'moderato', 'grave']).toContain(a.gravita);
      expect(a.meccanismo.length).toBeGreaterThan(5);
      expect(a.variabile.length).toBeGreaterThan(2);
    }
    // Ordinati per gravità (grave prima).
    const rank = { grave: 3, moderato: 2, lieve: 1 } as const;
    for (let i = 1; i < alerts.length; i++) {
      expect(rank[alerts[i - 1]!.gravita]).toBeGreaterThanOrEqual(rank[alerts[i]!.gravita]);
    }
  });

  it('vasocostrittore potente (α1) → rischio di necrosi da stravaso', () => {
    const { engine, mod } = buildRx();
    dose(engine, mod, { noradrenaline: 0.5 });
    const { alerts } = mod.assess(engine);
    expect(has(alerts, 'stravaso')).toBe(true);
    expect(get(alerts, 'stravaso')!.variabile).toContain('α1');
  });

  it('adrenalina → lattato da β2 etichettato come glicolisi aerobia (NON ipoperfusione)', () => {
    const { engine, mod } = buildRx();
    dose(engine, mod, { adrenaline: 0.2 });
    const { alerts } = mod.assess(engine);
    const a = get(alerts, 'lattato-beta2');
    expect(a).toBeDefined();
    expect(a!.meccanismo.toLowerCase()).toContain('non');
  });

  it("l'ipokaliemia aggrava il rischio aritmico con stimolo β1", () => {
    const normoK = buildRx({ metabolic: { potassium: 4.2 } });
    dose(normoK.engine, normoK.mod, { adrenaline: 0.2 });
    const aN = normoK.mod.assess(normoK.engine).alerts;

    const hypoK = buildRx({ metabolic: { potassium: 2.7 } });
    dose(hypoK.engine, hypoK.mod, { adrenaline: 0.2 });
    const aH = hypoK.mod.assess(hypoK.engine).alerts;

    const rank = { grave: 3, moderato: 2, lieve: 1, undefined: 0 } as Record<string, number>;
    const sevN = rank[get(aN, 'aritmia')?.gravita ?? 'undefined']!;
    const sevH = rank[get(aH, 'aritmia')?.gravita ?? 'undefined']!;
    expect(has(aH, 'aritmia')).toBe(true);
    expect(sevH).toBeGreaterThanOrEqual(sevN);
  });

  it('vasopressina → rischio di iponatriemia (V2)', () => {
    const { engine, mod } = buildRx();
    dose(engine, mod, { vasopressin: 0.05 });
    const { alerts } = mod.assess(engine);
    expect(has(alerts, 'iponatriemia')).toBe(true);
  });

  it('blu di metilene → metemoglobina / rischio serotoninergico', () => {
    const { engine, mod } = buildRx({ metabolic: { extraNO: 0.4 } });
    dose(engine, mod, { methyleneBlue: 2 }, 150);
    const { alerts } = mod.assess(engine);
    expect(has(alerts, 'blu-metilene')).toBe(true);
  });

  it('nitroprussiato: accumulo di cianuro → avviso di tossicità', () => {
    const { engine, mod } = buildRx();
    mod.pharmaco.setDose('nitroprusside', 6);
    mod.pharmaco.cyanide = 2.5; // accumulo cumulativo simulato
    engine.run(2); // aggiorna lastEffects
    const { alerts } = mod.assess(engine);
    expect(has(alerts, 'cianuro')).toBe(true);
    expect(get(alerts, 'cianuro')!.variabile.toLowerCase()).toContain('cianuro');
  });

  it('tachicardia ad alta richiesta → ischemia miocardica con EVR nella variabile', () => {
    const { engine, mod } = buildRx();
    dose(engine, mod, { adrenaline: 0.3 });
    const { alerts } = mod.assess(engine);
    const isch = get(alerts, 'ischemia');
    expect(isch).toBeDefined();
    expect(isch!.variabile).toContain('EVR');
  });
});
