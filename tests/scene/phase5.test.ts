import { readFileSync } from 'node:fs';
import { Plane, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { F, SAMPLE_SIZE } from '../../src/physiology/engine';
import { defaultParams } from '../../src/physiology/params';
import { sampleBuffer } from '../../src/store/sampleBuffer';
import { sectionPlane } from '../../src/scene/heart/sectionPlanes';
import { ValveDynamics } from '../../src/scene/heart/valveDynamics';

const meta = JSON.parse(readFileSync('public/models/heart-bp3d.json', 'utf8')) as {
  groups: Record<string, { start: number; count: number }>;
  leaflets: { valve: number; point: number[]; axis: number[] }[];
  paths: { side: number; stride: number; volume: number; data: number[] }[];
  longAxis: number[];
  lvApex: number[];
  mitralCenter: number[];
  valveCenters: number[][];
};

function pushSample(values: Partial<Record<keyof typeof F, number>>) {
  const s = new Float32Array(SAMPLE_SIZE);
  for (const [k, v] of Object.entries(values)) s[F[k as keyof typeof F]] = v;
  sampleBuffer.push(s, 1);
}

describe('valvole: apertura guidata dal flusso', () => {
  it('si aprono con flusso anterogrado e si chiudono senza flusso', () => {
    const v = new ValveDynamics();
    pushSample({ qAV: 400, qMV: 0 });
    for (let i = 0; i < 20; i++) v.update(0.01, defaultParams());
    expect(v.open[1]).toBeGreaterThan(0.95);
    expect(v.open[0]).toBeLessThan(0.05);
    pushSample({ qAV: 0 });
    for (let i = 0; i < 30; i++) v.update(0.01, defaultParams());
    expect(v.open[1]).toBeLessThan(0.05);
  });
  it('stenosi: apertura massima ridotta; insufficienza: coaptazione incompleta', () => {
    const p = defaultParams();
    p.aortic.area = 0.7;
    p.mitral.regurgitantArea = 0.4;
    const v = new ValveDynamics();
    pushSample({ qAV: 400, qMV: -100 });
    for (let i = 0; i < 30; i++) v.update(0.01, p);
    expect(v.open[1]).toBeLessThan(0.5);
    expect(v.open[0]).toBeGreaterThan(0.15);
  });
});

describe('asset: strutture interne e flusso', () => {
  it('gruppi di rendering presenti (esterno, cavità, papillari, valvole)', () => {
    for (const k of ['exterior', 'cavities', 'papillary', 'valves'])
      expect(meta.groups[k]!.count).toBeGreaterThan(0);
  });
  it('11 lembi valvolari reali con asse di cerniera unitario', () => {
    expect(meta.leaflets.length).toBe(11);
    for (const l of meta.leaflets)
      expect(Math.hypot(...(l.axis as [number, number, number]))).toBeCloseTo(1, 3);
  });
  it('percorsi del flusso: destri e sinistri, raggi del lume plausibili', () => {
    expect(meta.paths.filter((p) => p.side === 0).length).toBeGreaterThanOrEqual(4);
    expect(meta.paths.filter((p) => p.side === 1).length).toBeGreaterThanOrEqual(4);
    for (const p of meta.paths) {
      const n = p.data.length / p.stride;
      expect(n).toBeGreaterThan(50);
      const r = Array.from({ length: n }, (_, i) => p.data[i * p.stride + 3]!).sort((a, b) => a - b);
      expect(r[n >> 1]!).toBeGreaterThan(0.2); // mediana > 2 mm
      expect(r[n - 1]!).toBeLessThan(2.6);
    }
  });
});

describe('piani di sezione', () => {
  it('quattro camere: contiene l’asse lungo; asse corto: perpendicolare', () => {
    const pl = sectionPlane(meta, 'quattroCamere', 0, new Plane());
    const axis = new Vector3(...(meta.longAxis as [number, number, number]));
    expect(Math.abs(pl.normal.dot(axis))).toBeLessThan(1e-6);
    expect(pl.normal.z).toBeLessThanOrEqual(0); // si rimuove la metà anteriore
    const sa = sectionPlane(meta, 'asseCorto', 0, new Plane());
    expect(Math.abs(sa.normal.dot(axis))).toBeCloseTo(1, 6);
  });
});
