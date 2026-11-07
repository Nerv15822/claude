import { describe, expect, it } from 'vitest';
import { DISTRICT_KEYS, districtIndex } from '../../src/engine';
import { steady } from './helpers';

/** Fase 1 — i sei distretti sistemici e l'autoregolazione coronarica/cerebrale. */
describe('Emodinamica · distretti sistemici', () => {
  it('le frazioni di gittata sommano a 1 e i flussi sono positivi', () => {
    const { beat } = steady();
    const sum = beat.districtFraction.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 2);
    for (const q of beat.districtFlow) expect(q).toBeGreaterThan(0);
  });

  it('il flusso coronarico a riposo è ≈ 0.2–0.3 L/min', () => {
    const { beat } = steady();
    const q = beat.districtFlow[districtIndex('coronary')]!;
    expect(q).toBeGreaterThanOrEqual(0.18);
    expect(q).toBeLessThanOrEqual(0.4);
  });

  it('autoregolazione: coronarico e cerebrale variano meno del renale al variare della pressione', () => {
    // Ipotensione (bassa volemia) vs normale: i letti autoregolati difendono il flusso.
    const lowP = steady({ bloodVolume: 3800 }).beat;
    const normal = steady({ bloodVolume: 5000 }).beat;

    const rel = (b: typeof normal, key: (typeof DISTRICT_KEYS)[number]) =>
      b.districtFlow[districtIndex(key)]!;

    const dCoronary = Math.abs(rel(lowP, 'coronary') - rel(normal, 'coronary')) / rel(normal, 'coronary');
    const dCerebral = Math.abs(rel(lowP, 'cerebral') - rel(normal, 'cerebral')) / rel(normal, 'cerebral');
    const dRenal = Math.abs(rel(lowP, 'renal') - rel(normal, 'renal')) / rel(normal, 'renal');

    // I letti autoregolati si riducono proporzionalmente meno del renale (non autoregolato).
    expect(dCoronary).toBeLessThan(dRenal);
    expect(dCerebral).toBeLessThan(dRenal);
    // E il calo del flusso cerebrale resta contenuto.
    expect(dCerebral).toBeLessThan(0.25);
  });
});
