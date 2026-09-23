import { describe, expect, it } from 'vitest';
import { CardioEngine, F, SAMPLE_SIZE } from '../../src/physiology/engine';
import { defaultParams } from '../../src/physiology/params';
import { createSampleBuffer } from '../../src/store/sampleBuffer';
import { FRAME_CAPACITY, FRAME_FLOATS, REF_OFFSET } from '../../src/workers/protocol';

describe('confronto: pacchetto con paziente e riferimento', () => {
  it('i campioni del riferimento vanno nel secondo buffer, senza mescolarsi con il paziente', () => {
    const params = defaultParams();
    params.bloodVolume = 4000;
    const patient = new CardioEngine({ params });
    const ref = new CardioEngine();
    const pkt = new Float32Array(FRAME_FLOATS);
    expect(REF_OFFSET).toBe(FRAME_CAPACITY * SAMPLE_SIZE);
    for (let i = 0; i < 10; i++) {
      for (let k = 0; k < 8; k++) {
        patient.step();
        ref.step();
      }
      patient.writeSample(pkt, i * SAMPLE_SIZE);
      ref.writeSample(pkt, REF_OFFSET + i * SAMPLE_SIZE);
    }
    const a = createSampleBuffer();
    const b = createSampleBuffer();
    a.push(pkt, 10);
    b.push(pkt, 10, REF_OFFSET);
    expect(a.head).toBe(10);
    expect(b.head).toBe(10);
    expect(a.latest(F.t)).toBeCloseTo(b.latest(F.t), 6);
    // Volemie diverse: il volume totale campionato non coincide
    const tot = (buf: typeof a) =>
      buf.latest(F.vLV) + buf.latest(F.vRV) + buf.latest(F.vLA) + buf.latest(F.vRA);
    expect(Math.abs(tot(a) - tot(b))).toBeGreaterThan(0);
  });
});
