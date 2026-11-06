import { describe, expect, it } from 'vitest';
import { steady } from './helpers';

/**
 * Fase 1 — il caso normale a riposo deve produrre valori fisiologici plausibili.
 * Riferimenti: adulto 70 kg, FC 70, respiro spontaneo (CLAUDE.md).
 */
describe('Emodinamica · caso normale a regime', () => {
  const { beat } = steady();

  it('frequenza e gittata', () => {
    expect(beat.hr).toBeCloseTo(70, 0);
    expect(beat.co).toBeGreaterThanOrEqual(4.3);
    expect(beat.co).toBeLessThanOrEqual(6.2);
    expect(beat.sv).toBeGreaterThanOrEqual(60);
    expect(beat.sv).toBeLessThanOrEqual(95);
  });

  it('pressione aortica 120/80 ± 10', () => {
    expect(beat.pas).toBeGreaterThanOrEqual(105);
    expect(beat.pas).toBeLessThanOrEqual(135);
    expect(beat.pad).toBeGreaterThanOrEqual(62);
    expect(beat.pad).toBeLessThanOrEqual(92);
    expect(beat.map).toBeGreaterThanOrEqual(80);
    expect(beat.map).toBeLessThanOrEqual(105);
  });

  it('pressioni di riempimento', () => {
    expect(beat.cvp).toBeGreaterThanOrEqual(1);
    expect(beat.cvp).toBeLessThanOrEqual(6);
    expect(beat.paop).toBeGreaterThanOrEqual(4);
    expect(beat.paop).toBeLessThanOrEqual(12);
  });

  it('arteria polmonare 25/10 (media 12–18)', () => {
    expect(beat.paps).toBeGreaterThanOrEqual(18);
    expect(beat.paps).toBeLessThanOrEqual(30);
    expect(beat.papm).toBeGreaterThanOrEqual(11);
    expect(beat.papm).toBeLessThanOrEqual(19);
  });

  it('frazione di eiezione e volumi del VS', () => {
    expect(beat.lvef).toBeGreaterThanOrEqual(55);
    expect(beat.lvef).toBeLessThanOrEqual(68);
    expect(beat.lvedv).toBeGreaterThanOrEqual(115);
    expect(beat.lvedv).toBeLessThanOrEqual(145);
    expect(beat.rvef).toBeGreaterThanOrEqual(45);
    expect(beat.rvef).toBeLessThanOrEqual(68);
  });

  it('obiettivi di Fase 1: MSFP 8–10, PVC ≈ 3, PAPm ≈ 15', () => {
    expect(beat.msfp).toBeGreaterThanOrEqual(7);
    expect(beat.msfp).toBeLessThanOrEqual(10.5);
    expect(beat.cvp).toBeCloseTo(3, 0);
    expect(beat.papm).toBeGreaterThanOrEqual(12);
    expect(beat.papm).toBeLessThanOrEqual(18);
  });

  it('resistenze vascolari di ordine di grandezza corretto', () => {
    expect(beat.svr).toBeGreaterThanOrEqual(900);
    expect(beat.svr).toBeLessThanOrEqual(1600);
    expect(beat.pvr).toBeGreaterThanOrEqual(40);
    expect(beat.pvr).toBeLessThanOrEqual(250);
  });

  it('accoppiamento ventricolo-arterioso ed energetica plausibili', () => {
    expect(beat.ees).toBeGreaterThan(0);
    expect(beat.eaOverEes).toBeGreaterThanOrEqual(0.3);
    expect(beat.eaOverEes).toBeLessThanOrEqual(1.2);
    expect(beat.externalWork).toBeGreaterThanOrEqual(0.6);
    expect(beat.externalWork).toBeLessThanOrEqual(1.8);
    expect(beat.cpp).toBeGreaterThanOrEqual(45); // perfusione coronarica diastolica
  });
});
