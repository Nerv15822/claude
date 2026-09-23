import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { computeDeform, createDeformState, REF_VOLUME } from '../../src/scene/heart/deformation';
import { Plane, Vector3 } from 'three';
import { septumDirection } from '../../src/scene/heart/heartMaterial';
import { sectionPlane } from '../../src/scene/heart/sectionPlanes';
import { septumFrame } from '../../src/scene/heart/septumFrame';
import { buildShuntPaths, SHUNT_FLOW, SHUNT_POINTS, SHUNT_SIDE } from '../../src/scene/heart/shuntPaths';
import type { FlowPath } from '../../src/scene/heart/anatomicalAsset';

const meta = JSON.parse(readFileSync('public/models/heart-bp3d.json', 'utf8')) as {
  paths: FlowPath[];
  valveCenters: number[][];
  mitralCenter: number[];
  lvApex: number[];
  rvApex: number[];
  laCenter: number[];
  raCenter: number[];
  longAxis: number[];
  baseApexLength: number;
  vertexCount: number;
  bboxMin: number[];
  bboxMax: number[];
  layout: { name: string; offset: number; bytes: number }[];
};

/** Posizioni e codici di superficie decodificati dal binario (come in anatomicalAsset.ts). */
function decode() {
  const bin = readFileSync('public/models/heart-bp3d.bin');
  const buf = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength);
  const part = (n: string) => meta.layout.find((l) => l.name === n)!;
  const N = meta.vertexCount;
  const P = new Uint16Array(buf, part('position').offset, N * 3);
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < pos.length; i++) {
    const k = i % 3;
    pos[i] = meta.bboxMin[k]! + (P[i]! / 65535) * (meta.bboxMax[k]! - meta.bboxMin[k]!);
  }
  const surf = new Uint8Array(buf, part('aSurface').offset, N * 2);
  const codes = new Float32Array(N);
  for (let i = 0; i < N; i++) codes[i] = surf[i * 2 + 1]!;
  return { pos, codes };
}

const R = REF_VOLUME;

describe('deformazione: cavità, ipertrofia, setto', () => {
  it('in sistole la cavità si riduce più dell’epicardio (ispessimento di parete)', () => {
    const d = createDeformState();
    computeDeform(d, 50, 55, 55, 50, 120, 25, 1, R);
    expect(d.lvRadCav).toBeLessThan(d.lvRad - 0.1);
    expect(d.rvRadCav).toBeLessThan(d.rvRad - 0.05);
    computeDeform(d, R.lv, R.rv, R.la, R.ra, 95, 15, 0, R);
    expect(d.lvRadCav).toBeCloseTo(1, 5);
    expect(d.lvRad).toBeCloseTo(1, 5);
  });
  it('l’ipertrofia ingrandisce l’epicardio senza modificare la cavità', () => {
    const a = createDeformState();
    const b = createDeformState();
    computeDeform(a, 110, 120, 50, 50, 95, 15, 0, R);
    computeDeform(b, 110, 120, 50, 50, 95, 15, 0, R, undefined, { lvWall: 1.6, rvWall: 1 });
    expect(b.lvRad).toBeGreaterThan(a.lvRad + 0.05);
    expect(b.lvRadCav).toBeCloseTo(a.lvRadCav, 6);
    expect(b.rvRad).toBeCloseTo(a.rvRad, 6);
  });
  it('setto: spostamento verso il VS quando il volume settale si riduce (sovraccarico del VD)', () => {
    const d = createDeformState();
    computeDeform(d, 110, 120, 50, 50, 95, 15, 0, R, 4.8);
    expect(d.septum).toBeCloseTo(0, 5);
    computeDeform(d, 90, 170, 40, 70, 90, 40, 0, R, -2);
    expect(d.septum).toBeLessThan(-0.6);
    computeDeform(d, 90, 170, 40, 70, 90, 40, 0, R, -40);
    expect(d.septum).toBeGreaterThanOrEqual(-1.2);
  });
});

describe('percorsi degli shunt', () => {
  const shunts = buildShuntPaths(meta.paths, meta.valveCenters[1]![1]!);
  const ends = (p: FlowPath) => {
    const d = p.data;
    const o = d.length - p.stride;
    return { a: [d[0]!, d[1]!, d[2]!], b: [d[o]!, d[o + 1]!, d[o + 2]!] };
  };
  const dist = (a: number[], b: number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);

  it('DIA, DIV e dotto con flussi dedicati e lunghezze anatomiche plausibili', () => {
    expect(shunts.map((p) => p.data[4])).toEqual([SHUNT_FLOW.asd, SHUNT_FLOW.vsd, SHUNT_FLOW.pda]);
    for (const p of shunts) {
      expect(p.side).toBe(SHUNT_SIDE);
      expect(p.data.length).toBe(SHUNT_POINTS * p.stride);
      const { a, b } = ends(p);
      // Il difetto attraversa un setto/parete sottile, il dotto è corto (1–2 cm nell'adulto)
      expect(dist(a, b)).toBeGreaterThan(0.3);
      expect(dist(a, b)).toBeLessThan(4.5);
      for (const v of p.data) expect(Number.isFinite(v)).toBe(true);
    }
  });
  it('il dotto parte dall’arco aortico, sopra la valvola aortica', () => {
    const { a } = ends(shunts[2]!);
    expect(a[1]!).toBeGreaterThan(meta.valveCenters[1]![1]! + 3);
  });
});

describe('setto e shunt nella geometria reale', () => {
  const { pos, codes } = decode();
  const frame = septumFrame(
    pos,
    codes,
    meta.lvApex,
    meta.longAxis,
    meta.baseApexLength,
    septumDirection(meta).toArray(),
  );
  it('il setto sta tra le cavità del VS e del VD con spessore plausibile', () => {
    expect(frame.thickness).toBeGreaterThan(0.4);
    expect(frame.thickness).toBeLessThan(1.8);
    // Nessun vertice delle due cavità sulla superficie media del setto (entro metà spessore)
    const c = new Vector3(...frame.center);
    const d = new Vector3(...frame.dir);
    const ax = new Vector3(...meta.longAxis);
    let inside = 0;
    for (let i = 0; i < codes.length; i++) {
      if (codes[i] !== 5 && codes[i] !== 6) continue;
      const q = new Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]).sub(c);
      const a = q.dot(ax);
      const s = q.dot(d);
      const lat = q.clone().addScaledVector(ax, -a).addScaledVector(d, -s).length();
      if (Math.abs(a) < 0.5 && lat < 0.8 && Math.abs(s) < frame.thickness * 0.4) inside++;
    }
    expect(inside).toBe(0);
  });
  it('DIA e DIV cadono nella metà conservata della sezione 4 camere', () => {
    const pl = sectionPlane(meta, 'quattroCamere', 0, new Plane());
    const shunts = buildShuntPaths(meta.paths, meta.valveCenters[1]![1]!, {
      normal: pl.normal.toArray(),
      constant: pl.constant,
    });
    for (const p of shunts.slice(0, 2)) {
      const d = p.data;
      const o = d.length - p.stride;
      for (const k of [0, o]) {
        const dist = pl.distanceToPoint(new Vector3(d[k], d[k + 1], d[k + 2]));
        expect(dist).toBeGreaterThan(0.1);
        expect(dist).toBeLessThan(1.3);
      }
    }
  });
});
