import { readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** Controlli di coerenza sull'asset anatomico precalcolato (scripts/build-anatomy.ts). */
describe('modello anatomico BodyParts3D', () => {
  const meta = JSON.parse(readFileSync('public/models/heart-bp3d.json', 'utf8')) as {
    source: string;
    vertexCount: number;
    indexCount: number;
    refVolume: Record<string, number>;
    longAxis: number[];
    wideIndex: boolean;
    layout: { name: string; offset: number; bytes: number }[];
  };
  const size = statSync('public/models/heart-bp3d.bin').size;
  const bin = readFileSync('public/models/heart-bp3d.bin');

  it("riporta l'attribuzione richiesta dalla licenza CC BY 4.0", () => {
    expect(meta.source).toContain('BodyParts3D');
    expect(meta.source).toContain('CC Attribution 4.0');
  });
  it('layout binario coerente con dimensioni e conteggi', () => {
    for (const l of meta.layout) expect(l.offset + l.bytes).toBeLessThanOrEqual(size);
    const idx = meta.layout.find((l) => l.name === 'index')!;
    expect(idx.bytes).toBe(meta.indexCount * (meta.wideIndex ? 4 : 2));
    expect(meta.indexCount % 3).toBe(0);
    expect(size).toBeLessThan(2.5 * 1024 * 1024);
  });
  it('indici entro il numero di vertici', () => {
    const l = meta.layout.find((x) => x.name === 'index')!;
    const arr = meta.wideIndex
      ? new Uint32Array(bin.buffer, bin.byteOffset + l.offset, meta.indexCount)
      : new Uint16Array(bin.buffer, bin.byteOffset + l.offset, meta.indexCount);
    let max = 0;
    for (const v of arr) max = Math.max(max, v);
    expect(max).toBeLessThan(meta.vertexCount);
  });
  it('pesi di regione normalizzati (somma ≈ 1)', () => {
    const c = meta.layout.find((x) => x.name === 'aChamber')!;
    const v = meta.layout.find((x) => x.name === 'aVessel')!;
    for (let i = 0; i < meta.vertexCount; i += 97) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += bin[c.offset + i * 4 + k]! + bin[v.offset + i * 4 + k]!;
      expect(Math.abs(s / 255 - 1)).toBeLessThan(0.03);
    }
  });
  it('volumi delle cavità reali plausibili (mL) e asse lungo verso sinistra-basso-avanti', () => {
    expect(meta.refVolume.lv).toBeGreaterThan(60);
    expect(meta.refVolume.lv).toBeLessThan(160);
    expect(meta.refVolume.rv).toBeGreaterThan(60);
    const [x, y, z] = meta.longAxis as [number, number, number];
    expect(x).toBeGreaterThan(0);
    expect(y).toBeLessThan(0);
    expect(z).toBeGreaterThan(0);
  });
});
