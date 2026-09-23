import { describe, expect, it } from 'vitest';
import { heartSdf, LV_ELLIPSOID, RV_ELLIPSOID, LA_ELLIPSOID } from '../../src/scene/heart/anatomy';
import { computeDeform, createDeformState, REF_VOLUME } from '../../src/scene/heart/deformation';
import { buildHeartGeometry } from '../../src/scene/heart/heartGeometry';
import { classifyMesh } from '../../src/scene/heart/glbNaming';

describe('anatomia procedurale', () => {
  it('i centri delle camere sono interni alla superficie', () => {
    for (const e of [LV_ELLIPSOID, RV_ELLIPSOID, LA_ELLIPSOID]) expect(heartSdf(e.c)).toBeLessThan(0);
  });
  it("l'apice del VS è a sinistra, in basso e anteriore rispetto alla base", () => {
    const lv = LV_ELLIPSOID;
    expect(lv.ax[0]).toBeGreaterThan(0);
    expect(lv.ax[1]).toBeLessThan(0);
    expect(lv.ax[2]).toBeGreaterThan(0);
  });
});

describe('mesh', () => {
  const g = buildHeartGeometry(0.4);
  it('genera una mesh chiusa non vuota con attributi validi', () => {
    const n = g.position.length / 3;
    expect(n).toBeGreaterThan(2000);
    expect(g.index.length % 3).toBe(0);
    for (let i = 0; i < g.index.length; i++) expect(g.index[i]!).toBeLessThan(n);
    for (let i = 0; i < n; i++) {
      const w =
        g.aChamber[i * 4]! +
        g.aChamber[i * 4 + 1]! +
        g.aChamber[i * 4 + 2]! +
        g.aChamber[i * 4 + 3]! +
        g.aVessel[i * 4]! +
        g.aVessel[i * 4 + 1]! +
        g.aVessel[i * 4 + 2]! +
        g.aVessel[i * 4 + 3]!;
      expect(w).toBeCloseTo(1, 4);
    }
    for (const x of g.normal) expect(Number.isFinite(x)).toBe(true);
  });
});

describe('deformazione guidata dal motore', () => {
  it('scala 1 ai volumi di riferimento, < 1 in sistole', () => {
    const d = createDeformState();
    computeDeform(d, REF_VOLUME.lv, REF_VOLUME.rv, REF_VOLUME.la, REF_VOLUME.ra, 95, 15, 0);
    expect(d.lvRad).toBeCloseTo(1, 6);
    expect(d.ao).toBeCloseTo(1, 6);
    computeDeform(d, 50, 55, 55, 50, 120, 25, 1);
    expect(d.lvRad).toBeLessThan(0.92);
    expect(d.lvAx).toBeLessThan(1);
    expect(d.ao).toBeGreaterThan(1);
    expect(d.twist).toBeGreaterThan(0);
  });
  it('riconosce le mesh GLB per nome', () => {
    expect(classifyMesh('Heart_LV')).toBe('lv');
    expect(classifyMesh('left_ventricle')).toBe('lv');
    expect(classifyMesh('Aorta_ascending')).toBe('aorta');
    expect(classifyMesh('pulmonary_trunk')).toBe('pa');
    expect(classifyMesh('coronary_LAD')).toBe('other');
  });
});
