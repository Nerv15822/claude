import { beforeAll, describe, expect, it } from 'vitest';
import type { BeatMetrics } from '../../src/physiology/metrics';
import { steady } from './helpers';

/** Test di direzione fisiologica: la risposta del modello deve andare nel verso atteso. */
describe('risposte fisiologiche', () => {
  let base: BeatMetrics;
  beforeAll(() => {
    base = steady().beat;
  });

  it('Frank-Starling: ↑ volemia → ↑ VTD e ↑ gittata sistolica', () => {
    const b = steady({ bloodVolume: 5500 }).beat;
    expect(b.lvEdv).toBeGreaterThan(base.lvEdv);
    expect(b.forwardSv).toBeGreaterThan(base.forwardSv);
    expect(b.raMean).toBeGreaterThan(base.raMean);
  });

  it('↑ SVR → ↑ PAM, ↓ gittata sistolica', () => {
    const b = steady({ systemic: { r: 1.6 } }).beat;
    expect(b.aoMean).toBeGreaterThan(base.aoMean + 15);
    expect(b.forwardSv).toBeLessThan(base.forwardSv);
  });

  it('↑ contrattilità (Ees) → ↑ FE, ↓ VTS', () => {
    const b = steady({ lv: { ees: 5 } }).beat;
    expect(b.ef).toBeGreaterThan(base.ef);
    expect(b.lvEsv).toBeLessThan(base.lvEsv);
  });

  it('↓ contrattilità → ↓ FE, ↑ PCWP', () => {
    const b = steady({ lv: { ees: 1.2 } }).beat;
    expect(b.ef).toBeLessThan(base.ef - 0.1);
    expect(b.laMean).toBeGreaterThan(base.laMean);
  });

  it('stenosi aortica severa (AVA 0.7 cm²): gradiente medio VS-Ao > 40 mmHg', () => {
    const b = steady({ aortic: { area: 0.7 } }).beat;
    expect(b.avMeanGradient).toBeGreaterThan(40);
    expect(b.lvSys).toBeGreaterThan(b.aoSys + 40);
  });

  it('insufficienza mitralica: frazione di rigurgito > 30 %, ↑ AS', () => {
    const b = steady({ mitral: { regurgitantArea: 0.4 } }).beat;
    expect(b.mrFraction).toBeGreaterThan(0.3);
    expect(b.laMax).toBeGreaterThan(base.laMax + 5);
    expect(b.forwardSv).toBeLessThan(base.forwardSv);
  });

  it('insufficienza aortica: rigurgito diastolico e ↑ pressione differenziale', () => {
    const b = steady({ aortic: { regurgitantArea: 0.3 } }).beat;
    expect(b.arFraction).toBeGreaterThan(0.3);
    expect(b.aoSys - b.aoDia).toBeGreaterThan(base.aoSys - base.aoDia);
    expect(b.aoDia).toBeLessThan(base.aoDia);
  });

  it('↑ PVR → ↑ PAP e ↑ pressioni destre', () => {
    const b = steady({ pulmonary: { r: 0.3 } }).beat;
    expect(b.paMean).toBeGreaterThan(base.paMean + 10);
    expect(b.rvSys).toBeGreaterThan(base.rvSys + 8);
    expect(b.raMean).toBeGreaterThan(base.raMean);
  });

  it('tamponamento: ↑ Ppc, equalizzazione AD≈AS, ↓ GC e polso paradosso > 10 mmHg', () => {
    const { engine, beat: b } = steady({
      pericardium: { effusion: 350 },
      ventilation: { spontaneousSwing: 5 },
    });
    expect(b.periMean).toBeGreaterThan(base.periMean + 3);
    expect(Math.abs(b.laMean - b.raMean)).toBeLessThan(2);
    expect(b.co).toBeLessThan(base.co * 0.7);
    expect(engine.lastResp.sbpVariation).toBeGreaterThan(10);
  });

  it('ipovolemia in ventilazione a pressione positiva: PPV > 13 %', () => {
    const { engine } = steady({ bloodVolume: 4200, ventilation: { mode: 'ppv', tidalVolume: 560, peep: 5 } });
    expect(engine.lastResp.ppv).toBeGreaterThan(13);
    const normo = steady({ ventilation: { mode: 'ppv', tidalVolume: 560, peep: 5 } }).engine;
    expect(normo.lastResp.ppv).toBeLessThan(10);
  });

  it('PEEP elevata → ↓ ritorno venoso e ↓ GC', () => {
    const lo = steady({ ventilation: { mode: 'ppv', peep: 0 } }).beat;
    const hi = steady({ ventilation: { mode: 'ppv', peep: 15 } }).beat;
    expect(hi.co).toBeLessThan(lo.co);
  });

  it('tachicardia: ↑ FC → ↓ VTD (diastole più breve)', () => {
    const b = steady({ rhythm: { hr: 140 } }).beat;
    expect(b.hr).toBeCloseTo(140, 0);
    expect(b.lvEdv).toBeLessThan(base.lvEdv);
  });

  it('fibrillazione atriale: perdita del contributo atriale → ↓ VTD', () => {
    const b = steady({ rhythm: { rhythm: 'af' } }, 40, 20).beat;
    expect(b.lvEdv).toBeLessThan(base.lvEdv);
  });

  it('BAV III: frequenza ventricolare = scappamento', () => {
    const b = steady({ rhythm: { rhythm: 'avb3', escapeRate: 38 } }, 40, 20).beat;
    expect(b.hr).toBeGreaterThan(36);
    expect(b.hr).toBeLessThan(40);
  });

  it('DIV: shunt sinistro-destro con Qp/Qs > 1.5', () => {
    const b = steady({ vsd: { area: 0.5 } }).beat;
    expect(b.vsdVolume).toBeGreaterThan(0);
    expect(b.qpqs).toBeGreaterThan(1.5);
  });

  it('SvO2 si riduce con la gittata', () => {
    const b = steady({ bloodVolume: 4000 }).beat;
    expect(b.svo2).toBeLessThan(base.svo2);
  });
});
