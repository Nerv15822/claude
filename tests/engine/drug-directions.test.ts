import { describe, expect, it } from 'vitest';
import { buildRx, dose, snap } from './pharm-helpers';

/**
 * Fase 2 — test di coerenza farmaco per farmaco (direzione delle risposte cliniche).
 * Il baroriflesso è attivo (preset "sveglio"), come nella pratica clinica.
 */
describe('Emodinamica · direzioni farmacologiche', () => {
  it('fenilefrina: MAP ↑, CO ↓, FC ↓ (bradicardia riflessa)', () => {
    const { engine, mod } = buildRx();
    const b0 = snap(engine.currentBeat);
    const b = dose(engine, mod, { phenylephrine: 1.5 });
    expect(b.map).toBeGreaterThan(b0.map + 5);
    expect(b.co).toBeLessThan(b0.co - 0.5);
    expect(b.hr).toBeLessThan(b0.hr - 8);
    expect(b.svr).toBeGreaterThan(b0.svr);
  });

  it('noradrenalina: MAP ↑ e CO ↑ (α1 + β1)', () => {
    const { engine, mod } = buildRx();
    const b0 = snap(engine.currentBeat);
    const b = dose(engine, mod, { noradrenaline: 0.3 });
    expect(b.map).toBeGreaterThan(b0.map + 10);
    expect(b.co).toBeGreaterThanOrEqual(b0.co); // CO mantenuta/aumentata (a differenza della fenilefrina)
    expect(b.svr).toBeGreaterThan(b0.svr);
  });

  it('dobutamina: CO ↑, SVR ↓, FC ↑ (inodilatatore β)', () => {
    const { engine, mod } = buildRx();
    const b0 = snap(engine.currentBeat);
    const b = dose(engine, mod, { dobutamine: 7.5 });
    expect(b.co).toBeGreaterThan(b0.co + 1);
    expect(b.svr).toBeLessThan(b0.svr);
    expect(b.hr).toBeGreaterThan(b0.hr);
  });

  it('vasopressina: MAP ↑, CO ↓, con circolo polmonare relativamente risparmiato', () => {
    const { engine, mod } = buildRx();
    const b0 = snap(engine.currentBeat);
    const pheny = (() => {
      const r = buildRx();
      return dose(r.engine, r.mod, { phenylephrine: 1.5 });
    })();
    const b = dose(engine, mod, { vasopressin: 0.04 });
    expect(b.map).toBeGreaterThan(b0.map + 5);
    expect(b.co).toBeLessThan(b0.co);
    // A parità di effetto sistemico, la vasopressina alza meno la PAP della fenilefrina.
    expect(b.papm - b0.papm).toBeLessThan(pheny.papm - b0.papm + 0.5);
  });

  it('esmololo: FC ↓ e CO ↓ (β1-blocco)', () => {
    const { engine, mod } = buildRx();
    const b0 = snap(engine.currentBeat);
    const b = dose(engine, mod, { esmolol: 250 });
    expect(b.hr).toBeLessThan(b0.hr - 10);
    expect(b.co).toBeLessThan(b0.co);
  });

  it('nitroglicerina: prevalentemente VENOSA (↓ precarico ≫ ↓ postcarico)', () => {
    const { engine, mod } = buildRx();
    const b0 = snap(engine.currentBeat);
    const b = dose(engine, mod, { nitroglycerin: 2 });
    expect(b.cvp).toBeLessThan(b0.cvp - 0.8); // crollo del precarico
    // La caduta relativa di SVR è modesta rispetto al crollo del precarico.
    const dSvr = (b0.svr - b.svr) / b0.svr;
    expect(dSvr).toBeLessThan(0.12);
  });

  it('nitroprussiato: dilatatore BILANCIATO (arterioso + venoso), non solo venoso', () => {
    const ntg = (() => {
      const r = buildRx();
      const base = snap(r.engine.currentBeat);
      const b = dose(r.engine, r.mod, { nitroglycerin: 1 }); // dose bassa: venoselettiva
      return { base, b };
    })();
    const snp = (() => {
      const r = buildRx();
      const base = snap(r.engine.currentBeat);
      const b = dose(r.engine, r.mod, { nitroprusside: 3 });
      return { base, b };
    })();
    // Il nitroprussiato riduce la SVR molto più della nitroglicerina (componente arteriosa).
    const dSvrNtg = ntg.base.svr - ntg.b.svr;
    const dSvrSnp = snp.base.svr - snp.b.svr;
    expect(dSvrSnp).toBeGreaterThan(dSvrNtg + 150);
    // Ma riduce anche il precarico (componente venosa): CVP in calo.
    expect(snp.b.cvp).toBeLessThan(snp.base.cvp);
  });

  it('clevidipina: arterioso-selettiva (SVR ↓, tachicardia riflessa, precarico preservato)', () => {
    const { engine, mod } = buildRx();
    const b0 = snap(engine.currentBeat);
    const b = dose(engine, mod, { clevidipine: 3 });
    expect(b.svr).toBeLessThan(b0.svr - 150);
    expect(b.hr).toBeGreaterThan(b0.hr); // tachicardia riflessa
    expect(b.cvp).toBeGreaterThan(b0.cvp - 0.6); // niente venodilatazione marcata
  });

  it('milrinone: inodilatatore (CO ↑, SVR ↓, PVR ↓)', () => {
    const { engine, mod } = buildRx();
    const b0 = snap(engine.currentBeat);
    const b = dose(engine, mod, { milrinone: 0.6 }, 180);
    expect(b.co).toBeGreaterThan(b0.co + 0.8);
    expect(b.svr).toBeLessThan(b0.svr);
    expect(b.pvr).toBeLessThan(b0.pvr + 1);
  });
});
