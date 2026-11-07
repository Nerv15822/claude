import { describe, expect, it } from 'vitest';
import { buildRx, dose, snap } from './pharm-helpers';

/**
 * Fase 2 — le fasce dose-dipendenti di dopamina e adrenalina devono EMERGERE da EC50
 * diversi, senza soglie hard-coded.
 */
describe('Emodinamica · fasce dose-dipendenti (emergenti da EC50)', () => {
  it('adrenalina: a dose bassa domina β (CO ↑, SVR ↓); a dose alta emerge α (MAP ↑↑)', () => {
    const low = (() => {
      const r = buildRx();
      const b0 = snap(r.engine.currentBeat);
      const b = dose(r.engine, r.mod, { adrenaline: 0.03 });
      const s = r.mod.lastEffects!.signals;
      return { dMap: b.map - b0.map, dSvr: b.svr - b0.svr, dCo: b.co - b0.co, a1: s.alpha1, b2: s.beta2 };
    })();
    const high = (() => {
      const r = buildRx();
      const b0 = snap(r.engine.currentBeat);
      const b = dose(r.engine, r.mod, { adrenaline: 0.3 });
      const s = r.mod.lastEffects!.signals;
      return { dMap: b.map - b0.map, dSvr: b.svr - b0.svr, dCo: b.co - b0.co, a1: s.alpha1, b2: s.beta2 };
    })();

    expect(low.dCo).toBeGreaterThan(1); // β: CO su già a dose bassa
    expect(low.dSvr).toBeLessThan(0); // β2: vasodilatazione a dose bassa
    expect(low.b2).toBeGreaterThan(low.a1); // a dose bassa prevale β2 sull'α1
    expect(high.dMap).toBeGreaterThan(low.dMap + 8); // α emerge ad alta dose
    // La fascia α EMERGE dagli EC50: l'occupazione α1 cresce molto più della β2 passando a dose alta.
    expect(high.a1 - low.a1).toBeGreaterThan(high.b2 - low.b2);
    expect(high.a1).toBeGreaterThan(low.a1 * 3);
  });

  it('dopamina: a dose bassa poco effetto pressorio; ad alta dose MAP ↑ (α emerge)', () => {
    const low = (() => {
      const r = buildRx();
      const b0 = snap(r.engine.currentBeat);
      const b = dose(r.engine, r.mod, { dopamine: 3 });
      return b.map - b0.map;
    })();
    const high = (() => {
      const r = buildRx();
      const b0 = snap(r.engine.currentBeat);
      const b = dose(r.engine, r.mod, { dopamine: 15 });
      return b.map - b0.map;
    })();
    expect(low).toBeLessThan(5); // dose "bassa": pressione poco modificata
    expect(high).toBeGreaterThan(low + 6); // dose alta: α emerge
  });
});
