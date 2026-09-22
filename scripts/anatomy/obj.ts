/** Lettura di file OBJ (BodyParts3D: triangoli, coordinate in mm). */
import { readFileSync } from 'node:fs';

export interface TriMesh {
  positions: Float64Array;
  indices: Uint32Array;
}

export function readObj(path: string): TriMesh {
  const text = readFileSync(path, 'latin1');
  const pos: number[] = [];
  const idx: number[] = [];
  for (const line of text.split('\n')) {
    if (line.startsWith('v ')) {
      const p = line.trim().split(/\s+/);
      pos.push(Number(p[1]), Number(p[2]), Number(p[3]));
    } else if (line.startsWith('f ')) {
      const f = line
        .trim()
        .split(/\s+/)
        .slice(1)
        .map((t) => Number(t.split('/')[0]) - 1);
      for (let i = 1; i < f.length - 1; i++) idx.push(f[0]!, f[i]!, f[i + 1]!);
    }
  }
  return { positions: new Float64Array(pos), indices: new Uint32Array(idx) };
}

export function mergeMeshes(meshes: TriMesh[]): TriMesh {
  let nv = 0;
  let ni = 0;
  for (const m of meshes) {
    nv += m.positions.length;
    ni += m.indices.length;
  }
  const positions = new Float64Array(nv);
  const indices = new Uint32Array(ni);
  let ov = 0;
  let oi = 0;
  for (const m of meshes) {
    positions.set(m.positions, ov);
    for (let i = 0; i < m.indices.length; i++) indices[oi + i] = m.indices[i]! + ov / 3;
    ov += m.positions.length;
    oi += m.indices.length;
  }
  return { positions, indices };
}

/** Volume con segno (mm³): positivo se le normali (winding) puntano verso l'esterno. */
export function signedVolume(m: TriMesh): number {
  let v = 0;
  const p = m.positions;
  for (let t = 0; t < m.indices.length; t += 3) {
    const a = m.indices[t]! * 3;
    const b = m.indices[t + 1]! * 3;
    const c = m.indices[t + 2]! * 3;
    v +=
      (p[a]! * (p[b + 1]! * p[c + 2]! - p[b + 2]! * p[c + 1]!) -
        p[a + 1]! * (p[b]! * p[c + 2]! - p[b + 2]! * p[c]!) +
        p[a + 2]! * (p[b]! * p[c + 1]! - p[b + 1]! * p[c]!)) /
      6;
  }
  return v;
}
