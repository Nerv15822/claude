import { describe, expect, it } from 'vitest';
import { S } from '../../src/engine';
import { steady } from './helpers';

/**
 * Fase 1 — la curva di Frank-Starling e quella di Guyton devono comportarsi correttamente.
 * NB: in Fase 1 il baroriflesso è assente (nessun modulatore), quindi le risposte sono
 * puramente meccaniche (precarico → gittata, ritorno venoso ↔ funzione cardiaca).
 */
describe('Emodinamica · Frank-Starling', () => {
  it('aumentando il precarico (volemia) aumentano VTD e gittata sistolica', () => {
    const lo = steady({ bloodVolume: 4200 }).beat;
    const mid = steady({ bloodVolume: 5000 }).beat;
    const hi = steady({ bloodVolume: 5800 }).beat;

    expect(lo.lvedv).toBeLessThan(mid.lvedv);
    expect(mid.lvedv).toBeLessThan(hi.lvedv);
    expect(lo.sv).toBeLessThan(mid.sv);
    expect(mid.sv).toBeLessThan(hi.sv);
  });

  it('la risposta di gittata al precarico satura (rendimenti decrescenti)', () => {
    const a = steady({ bloodVolume: 5000 }).beat;
    const b = steady({ bloodVolume: 5800 }).beat;
    const c = steady({ bloodVolume: 6600 }).beat;
    const gain1 = b.sv - a.sv;
    const gain2 = c.sv - b.sv;
    expect(gain2).toBeLessThan(gain1); // plateau della curva di funzione ventricolare
  });

  it('a contrattilità maggiore, maggiore gittata allo stesso precarico', () => {
    const normal = steady({ bloodVolume: 5000 }).beat;
    const inotropic = steady({
      bloodVolume: 5000,
      lv: { ees: 4.5, vd: 10, p0: 0.14, lambda: 0.036, v0: 10 },
    }).beat;
    expect(inotropic.sv).toBeGreaterThan(normal.sv);
    expect(inotropic.lvesv).toBeLessThan(normal.lvesv); // svuotamento sistolico maggiore
  });
});

describe('Emodinamica · Guyton (ritorno venoso ↔ funzione cardiaca)', () => {
  it('a regime il ritorno venoso eguaglia la gittata (circolazione chiusa)', () => {
    const { beat } = steady();
    expect(beat.venousReturn).toBeGreaterThan(0);
    expect(Math.abs(beat.venousReturn - beat.co)).toBeLessThan(0.3);
  });

  it('aumentando la volemia salgono MSFP, CO e PVC (risalita lungo le curve)', () => {
    const lo = steady({ bloodVolume: 4600 }).beat;
    const hi = steady({ bloodVolume: 5600 }).beat;
    expect(hi.msfp).toBeGreaterThan(lo.msfp);
    expect(hi.co).toBeGreaterThan(lo.co);
    expect(hi.cvp).toBeGreaterThan(lo.cvp);
  });

  it('riducendo la contrattilità la CO cala e la PVC sale (curva cardiaca verso il basso)', () => {
    const normal = steady().beat;
    const failing = steady({
      lv: { ees: 1.0, vd: 10, p0: 0.14, lambda: 0.036, v0: 10 },
      rv: { ees: 0.25, vd: 15, p0: 0.45, lambda: 0.024, v0: 15 },
    }).beat;
    expect(failing.co).toBeLessThan(normal.co);
    expect(failing.cvp).toBeGreaterThan(normal.cvp);
  });

  it('riducendo la resistenza al ritorno venoso (Rvr) aumenta la CO', () => {
    const normal = steady().beat;
    const lowRvr = steady({ systemic: { rv: 0.03 } }).beat;
    expect(lowRvr.co).toBeGreaterThan(normal.co);
  });

  it("l'identità del ritorno venoso (P_SV − PVC)/Rvr ≈ CO è soddisfatta a regime", () => {
    const { engine, beat } = steady();
    const psv = (engine.y[S.V_SV]! - engine.effParams.systemic.vv0) / engine.effParams.systemic.cv;
    const vrFlow = ((psv - beat.cvp) / engine.effParams.systemic.rv) * (60 / 1000); // L/min
    expect(Math.abs(vrFlow - beat.co)).toBeLessThan(0.6);
  });
});
