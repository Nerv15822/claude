import { describe, expect, it } from 'vitest';
import { DRUGS, PharmacoState } from '../../src/engine';
import { buildRx, dose, snap } from './pharm-helpers';

const CTX = { adrenergicResponsiveness: 1, extraNO: 0 };

/** Avanza la cinetica di un PharmacoState per `seconds` a passo `dt` (solo PK, veloce). */
function stepPk(st: PharmacoState, seconds: number, dt = 0.1): void {
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) st.step(dt);
}

describe('Emodinamica · casi speciali obbligatori', () => {
  it('efedrina: azione indiretta — pool di NA deplecibile e tachifilassi', () => {
    const st = new PharmacoState();
    st.setDose('ephedrine', 10);
    stepPk(st, 5);
    const poolEarly = st.nePool;
    const a1Early = st.effects(CTX).signals.alpha1;
    stepPk(st, 600); // esposizione sostenuta
    expect(st.nePool).toBeLessThan(poolEarly); // il pool si deplete (tachifilassi)
    // A pool deplettato, lo stesso Ce produce meno attivazione α1.
    const a1Late = st.effects(CTX).signals.alpha1;
    expect(a1Late).toBeLessThan(a1Early);
  });

  it('efedrina: efficacia ridotta nel paziente cronicamente deplettato', () => {
    const full = buildRx();
    const b0f = snap(full.engine.currentBeat);
    const bf = dose(full.engine, full.mod, { ephedrine: 20 }, 35);
    const riseFull = bf.map - b0f.map;
    expect(riseFull).toBeGreaterThan(3); // un bolo a pool pieno alza la MAP

    const depleted = buildRx();
    depleted.mod.pharmaco.nePool = 0.15; // deplezione cronica
    const b0d = snap(depleted.engine.currentBeat);
    const bd = dose(depleted.engine, depleted.mod, { ephedrine: 20 }, 35);
    const riseDepleted = bd.map - b0d.map;

    expect(riseDepleted).toBeLessThan(riseFull * 0.6);
  });

  it('nitroglicerina: tolleranza nitrica tempo-dipendente (effetto NO che si attenua)', () => {
    const st = new PharmacoState();
    st.setDose('nitroglycerin', 2);
    stepPk(st, 120);
    const noEarly = st.effects(CTX).signals.noVenous;
    const tolEarly = st.nitrateTolerance;
    stepPk(st, 3600); // un'ora di esposizione
    expect(st.nitrateTolerance).toBeGreaterThan(tolEarly + 0.2);
    expect(st.effects(CTX).signals.noVenous).toBeLessThan(noEarly);
  });

  it('nitroprussiato: donatore di NO BILANCIATO (arterioso ≈ venoso), non venoselettivo', () => {
    const snp = new PharmacoState();
    snp.setDose('nitroprusside', 3);
    stepPk(snp, 60);
    const s = snp.effects(CTX).signals;
    expect(s.noArterial).toBeGreaterThan(0.2);
    // Bilanciato: componente arteriosa e venosa simili (entro il 20%).
    expect(Math.abs(s.noArterial - s.noVenous) / s.noVenous).toBeLessThan(0.2);

    // La nitroglicerina a bassa dose è invece venoselettiva (arterioso ≪ venoso).
    const ntg = new PharmacoState();
    ntg.setDose('nitroglycerin', 1);
    stepPk(ntg, 60);
    const n = ntg.effects(CTX).signals;
    expect(n.noArterial).toBeLessThan(n.noVenous * 0.8);
  });

  it('nitroprussiato: tossicità da cianuro in funzione di dose cumulativa e durata', () => {
    const st = new PharmacoState();
    st.setDose('nitroprusside', 6);
    const c0 = st.cyanide;
    stepPk(st, 1800);
    expect(st.cyanide).toBeGreaterThan(c0 + 0.5); // accumulo cumulativo
  });

  it('levosimendan: offset lento (metabolita attivo a lunga emivita)', () => {
    const st = new PharmacoState();
    st.setDose('levosimendan', 0.2);
    stepPk(st, 600);
    const ceOn = st.getCe('levosimendan');
    st.setDose('levosimendan', 0);
    stepPk(st, 600);
    const ceOff = st.getCe('levosimendan');
    // Dopo 10 min dall'interruzione la concentrazione è ancora rilevante (τ_off lungo).
    expect(ceOff).toBeGreaterThan(ceOn * 0.6);
    expect(DRUGS.levosimendan.tauOff).toBeGreaterThan(1800);
  });

  it('blu di metilene: niente agonismo diretto, inibisce la guanilato ciclasi (↑SVR nella vasoplegia)', () => {
    const { engine, mod } = buildRx({ metabolic: { extraNO: 0.45 } });
    const b0 = snap(engine.currentBeat);
    const b = dose(engine, mod, { methyleneBlue: 2 }, 150);
    expect(b.svr).toBeGreaterThan(b0.svr); // blocco della vasodilatazione NO-mediata
    expect(b.map).toBeGreaterThan(b0.map);
    expect(mod.lastEffects!.signals.sGC).toBeGreaterThan(0.3);
  });

  it('idrocortisone: effetto permissivo — ripristina la responsività adrenergica', () => {
    // Acidosi: responsività depressa.
    const acid = buildRx({ metabolic: { ph: 7.0 } });
    acid.engine.run(2);
    const respAcid = acid.mod.lastResponsiveness;

    // Stessa acidosi + idrocortisone a concentrazione efficace.
    const acidHc = buildRx({ metabolic: { ph: 7.0 } });
    acidHc.mod.pharmaco.setDose('hydrocortisone', 200);
    acidHc.mod.pharmaco.ce.set('hydrocortisone', 200);
    acidHc.engine.run(2);
    const respHc = acidHc.mod.lastResponsiveness;

    expect(respAcid).toBeLessThan(0.75);
    expect(respHc).toBeGreaterThan(respAcid + 0.1); // ripristino parziale verso 1
  });
});
