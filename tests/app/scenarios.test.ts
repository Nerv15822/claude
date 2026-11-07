import { describe, expect, it } from 'vitest';
import { SCENARIOS, SCENARIO_BY_ID, buildScenario } from '../../src/app/scenarios';

/** Fase 4 — ogni scenario precaricato deve produrre la direzione emodinamica attesa. */
describe('Emodinamica · scenari precaricati', () => {
  const normal = buildScenario(SCENARIO_BY_ID.normale!).engine.currentBeat;

  it('ci sono almeno 11 scenari oltre al normale, tutti con scheda', () => {
    expect(SCENARIOS.length).toBeGreaterThanOrEqual(12);
    for (const s of SCENARIOS) {
      expect(s.nome.length).toBeGreaterThan(2);
      expect(s.scheda.length).toBeGreaterThan(20);
    }
  });

  it('shock settico/vasoplegia: SVR basse con CO conservata/alta', () => {
    for (const id of ['settico', 'vasoplegia-cec']) {
      const b = buildScenario(SCENARIO_BY_ID[id]!).engine.currentBeat;
      expect(b.svr).toBeLessThan(normal.svr - 150);
      expect(b.co).toBeGreaterThan(5);
    }
  });

  it('shock cardiogeno: CO bassa, PAOP alta, SvO₂ bassa', () => {
    const { engine, mod } = buildScenario(SCENARIO_BY_ID.cardiogeno!);
    const b = engine.currentBeat;
    expect(b.co).toBeLessThan(4.2);
    expect(b.paop).toBeGreaterThan(14);
    expect(mod.assess(engine).oxygen.svo2).toBeLessThan(0.62);
  });

  it('scompenso destro acuto ed embolia: PVR alte e VD dilatato', () => {
    for (const id of ['vd-acuto', 'embolia']) {
      const b = buildScenario(SCENARIO_BY_ID[id]!).engine.currentBeat;
      expect(b.pvr).toBeGreaterThan(250);
      expect(b.rvedv).toBeGreaterThan(normal.rvedv);
    }
  });

  it('shock neurogeno: ipotensione con bradicardia (niente tachicardia riflessa)', () => {
    const b = buildScenario(SCENARIO_BY_ID.neurogeno!).engine.currentBeat;
    expect(b.map).toBeLessThan(70);
    expect(b.hr).toBeLessThan(65);
  });

  it('ipovolemia emorragica: precarico basso e tachicardia compensatoria', () => {
    const b = buildScenario(SCENARIO_BY_ID.emorragico!).engine.currentBeat;
    expect(b.cvp).toBeLessThan(normal.cvp);
    expect(b.hr).toBeGreaterThan(normal.hr + 8);
    expect(b.svr).toBeGreaterThan(normal.svr);
  });

  it('tamponamento: equalizzazione delle pressioni e polso paradosso (PPV alto)', () => {
    const b = buildScenario(SCENARIO_BY_ID.tamponamento!).engine.currentBeat;
    expect(Math.abs(b.paop - b.cvp)).toBeLessThan(4); // equalizzazione
    expect(b.ppv).toBeGreaterThan(10); // polso paradosso
    expect(b.co).toBeLessThan(normal.co);
  });

  it('ipertensione polmonare riacutizzata: PAPm elevata', () => {
    const b = buildScenario(SCENARIO_BY_ID['ipertensione-polmonare']!).engine.currentBeat;
    expect(b.papm).toBeGreaterThan(22);
  });

  it('anestesia spinale: SVR ridotte e precarico basso', () => {
    const b = buildScenario(SCENARIO_BY_ID.spinale!).engine.currentBeat;
    expect(b.svr).toBeLessThan(normal.svr);
    expect(b.cvp).toBeLessThan(normal.cvp);
  });
});
