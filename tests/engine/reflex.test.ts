import { describe, expect, it } from 'vitest';
import { REFLEX_PRESETS } from '../../src/engine';
import { buildRx, dose, snap } from './pharm-helpers';

/** Fase 2 — baroriflesso con preset e modulatori di stato (pH). */
describe('Emodinamica · baroriflesso', () => {
  it('la fenilefrina causa bradicardia riflessa da svegli, non nel denervato', () => {
    const awake = buildRx({ preset: 'awake' });
    const b0a = snap(awake.engine.currentBeat);
    const ba = dose(awake.engine, awake.mod, { phenylephrine: 1.5 });
    const dHrAwake = ba.hr - b0a.hr;

    const den = buildRx({ preset: 'denervated' });
    const b0d = snap(den.engine.currentBeat);
    const bd = dose(den.engine, den.mod, { phenylephrine: 1.5 });
    const dHrDen = bd.hr - b0d.hr;

    expect(dHrAwake).toBeLessThan(-8); // bradicardia riflessa marcata
    expect(dHrDen).toBeGreaterThan(dHrAwake + 6); // assente/attenuata senza riflesso
  });

  it("l'ipovolemia dà tachicardia compensatoria da svegli, non nel denervato", () => {
    const awake = buildRx({ patch: { bloodVolume: 3800 }, preset: 'awake' });
    const den = buildRx({ patch: { bloodVolume: 3800 }, preset: 'denervated' });
    expect(awake.engine.currentBeat.hr).toBeGreaterThan(den.engine.currentBeat.hr + 10);
    // Senza riflesso l'ipovolemia è peggio tollerata (MAP più bassa).
    expect(den.engine.currentBeat.map).toBeLessThan(awake.engine.currentBeat.map);
  });

  it('i preset esistono con nome e guadagni ordinati (denervato ≪ sveglio)', () => {
    expect(REFLEX_PRESETS.awake.hr).toBeGreaterThan(REFLEX_PRESETS.anesthesia.hr);
    expect(REFLEX_PRESETS.denervated.hr).toBeLessThan(REFLEX_PRESETS.elderly.hr);
    expect(REFLEX_PRESETS.betablocked.hr).toBeLessThan(REFLEX_PRESETS.awake.hr);
    expect(REFLEX_PRESETS.neuraxial.art).toBeLessThan(REFLEX_PRESETS.awake.art); // simpaticectomia
  });

  it("l'acidosi (pH 7.0) attenua la risposta vasocostrittrice alla noradrenalina", () => {
    // Riflesso disattivato per isolare la responsività recettoriale (senza controregolazione).
    const normal = buildRx({ metabolic: { ph: 7.4 }, reflex: false });
    const b0n = snap(normal.engine.currentBeat);
    const bn = dose(normal.engine, normal.mod, { noradrenaline: 0.3 });
    const riseNormal = bn.svr - b0n.svr;

    const acid = buildRx({ metabolic: { ph: 7.0 }, reflex: false });
    const b0a = snap(acid.engine.currentBeat);
    const ba = dose(acid.engine, acid.mod, { noradrenaline: 0.3 });
    const riseAcid = ba.svr - b0a.svr;

    expect(riseAcid).toBeLessThan(riseNormal); // iporesponsività adrenergica (minore ↑SVR)
  });
});

describe('Emodinamica · nitroglicerina nel paziente ipovolemico', () => {
  it('nel preload-dipendente la nitroglicerina fa CALARE la CO', () => {
    const { engine, mod } = buildRx({ patch: { bloodVolume: 3700 }, preset: 'awake' });
    const b0 = snap(engine.currentBeat);
    const b = dose(engine, mod, { nitroglycerin: 2 }, 120);
    expect(b.co).toBeLessThan(b0.co - 0.3);
    expect(b.cvp).toBeLessThan(b0.cvp); // ulteriore caduta del precarico
  });
});
