import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { computeDeform, createDeformState, REF_VOLUME } from '../../src/scene/heart/deformation';
import { buildShuntPaths, SHUNT_FLOW, SHUNT_POINTS, SHUNT_SIDE } from '../../src/scene/heart/shuntPaths';
import type { FlowPath } from '../../src/scene/heart/anatomicalAsset';

const meta = JSON.parse(readFileSync('public/models/heart-bp3d.json', 'utf8')) as {
  paths: FlowPath[];
  valveCenters: number[][];
};

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
