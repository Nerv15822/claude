/**
 * Campi di distanza su griglia regolare (mm) a partire da mesh triangolari anche aperte.
 * - distanza non firmata esatta in una banda attorno ai triangoli
 * - "solido" tramite chiusura morfologica: flood fill dell'esterno bloccato dai voxel entro r dalla
 *   superficie (sigilla i fori < 2r), segno vicino alla superficie dalla normale del triangolo più vicino
 */
import type { TriMesh } from './obj';

export class Grid {
  readonly nx: number;
  readonly ny: number;
  readonly nz: number;
  constructor(
    readonly origin: [number, number, number],
    readonly size: [number, number, number],
    readonly h: number,
  ) {
    this.nx = Math.ceil(size[0] / h) + 1;
    this.ny = Math.ceil(size[1] / h) + 1;
    this.nz = Math.ceil(size[2] / h) + 1;
  }
  get count(): number {
    return this.nx * this.ny * this.nz;
  }
  idx(i: number, j: number, k: number): number {
    return i + this.nx * (j + this.ny * k);
  }
  /** Campionamento trilineare di un campo (coordinate in mm). */
  sample(f: Float32Array, x: number, y: number, z: number): number {
    const fx = Math.min(Math.max((x - this.origin[0]) / this.h, 0), this.nx - 1.001);
    const fy = Math.min(Math.max((y - this.origin[1]) / this.h, 0), this.ny - 1.001);
    const fz = Math.min(Math.max((z - this.origin[2]) / this.h, 0), this.nz - 1.001);
    const i = Math.floor(fx);
    const j = Math.floor(fy);
    const k = Math.floor(fz);
    const u = fx - i;
    const v = fy - j;
    const w = fz - k;
    const c = (a: number, b: number, d: number) => f[this.idx(i + a, j + b, k + d)]!;
    return (
      (1 - w) *
        ((1 - v) * ((1 - u) * c(0, 0, 0) + u * c(1, 0, 0)) + v * ((1 - u) * c(0, 1, 0) + u * c(1, 1, 0))) +
      w * ((1 - v) * ((1 - u) * c(0, 0, 1) + u * c(1, 0, 1)) + v * ((1 - u) * c(0, 1, 1) + u * c(1, 1, 1)))
    );
  }
}

/** Distanza punto-triangolo al quadrato (Eberly), con proiezione nel piano. */
function pointTriDist2(
  px: number,
  py: number,
  pz: number,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  cx: number,
  cy: number,
  cz: number,
): number {
  const abx = bx - ax,
    aby = by - ay,
    abz = bz - az;
  const acx = cx - ax,
    acy = cy - ay,
    acz = cz - az;
  const apx = px - ax,
    apy = py - ay,
    apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz;
  const d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) return apx * apx + apy * apy + apz * apz;
  const bpx = px - bx,
    bpy = py - by,
    bpz = pz - bz;
  const d3 = abx * bpx + aby * bpy + abz * bpz;
  const d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) return bpx * bpx + bpy * bpy + bpz * bpz;
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    const qx = apx - v * abx,
      qy = apy - v * aby,
      qz = apz - v * abz;
    return qx * qx + qy * qy + qz * qz;
  }
  const cpx = px - cx,
    cpy = py - cy,
    cpz = pz - cz;
  const d5 = abx * cpx + aby * cpy + abz * cpz;
  const d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) return cpx * cpx + cpy * cpy + cpz * cpz;
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    const qx = apx - w * acx,
      qy = apy - w * acy,
      qz = apz - w * acz;
    return qx * qx + qy * qy + qz * qz;
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
    const qx = bpx - w * (cx - bx),
      qy = bpy - w * (cy - by),
      qz = bpz - w * (cz - bz);
    return qx * qx + qy * qy + qz * qz;
  }
  const denom = 1 / (va + vb + vc);
  const v = vb * denom;
  const w = vc * denom;
  const qx = apx - abx * v - acx * w,
    qy = apy - aby * v - acy * w,
    qz = apz - abz * v - acz * w;
  return qx * qx + qy * qy + qz * qz;
}

export interface Band {
  /** Distanza non firmata (mm), `band` fuori dalla banda */
  dist: Float32Array;
  /** Triangolo più vicino (−1 fuori dalla banda) */
  tri: Int32Array;
}

export function unsignedBand(g: Grid, m: TriMesh, band: number): Band {
  const dist = new Float32Array(g.count).fill(band);
  const tri = new Int32Array(g.count).fill(-1);
  const p = m.positions;
  for (let t = 0; t < m.indices.length / 3; t++) {
    const a = m.indices[t * 3]! * 3;
    const b = m.indices[t * 3 + 1]! * 3;
    const c = m.indices[t * 3 + 2]! * 3;
    const lo = [0, 1, 2].map((k) => Math.min(p[a + k]!, p[b + k]!, p[c + k]!) - band);
    const hi = [0, 1, 2].map((k) => Math.max(p[a + k]!, p[b + k]!, p[c + k]!) + band);
    const i0 = Math.max(0, Math.floor((lo[0]! - g.origin[0]) / g.h));
    const i1 = Math.min(g.nx - 1, Math.ceil((hi[0]! - g.origin[0]) / g.h));
    const j0 = Math.max(0, Math.floor((lo[1]! - g.origin[1]) / g.h));
    const j1 = Math.min(g.ny - 1, Math.ceil((hi[1]! - g.origin[1]) / g.h));
    const k0 = Math.max(0, Math.floor((lo[2]! - g.origin[2]) / g.h));
    const k1 = Math.min(g.nz - 1, Math.ceil((hi[2]! - g.origin[2]) / g.h));
    for (let k = k0; k <= k1; k++) {
      const z = g.origin[2] + k * g.h;
      for (let j = j0; j <= j1; j++) {
        const y = g.origin[1] + j * g.h;
        for (let i = i0; i <= i1; i++) {
          const x = g.origin[0] + i * g.h;
          const d2 = pointTriDist2(
            x,
            y,
            z,
            p[a]!,
            p[a + 1]!,
            p[a + 2]!,
            p[b]!,
            p[b + 1]!,
            p[b + 2]!,
            p[c]!,
            p[c + 1]!,
            p[c + 2]!,
          );
          const id = g.idx(i, j, k);
          if (d2 < dist[id]! * dist[id]!) {
            dist[id] = Math.sqrt(d2);
            tri[id] = t;
          }
        }
      }
    }
  }
  return { dist, tri };
}

/** Maschera dell'esterno: flood fill dai bordi della griglia attraverso i voxel con dist ≥ r. */
export function exteriorMask(g: Grid, dist: Float32Array, r: number): Uint8Array {
  const ext = new Uint8Array(g.count);
  const stack = new Int32Array(g.count);
  let sp = 0;
  const push = (i: number, j: number, k: number) => {
    const id = g.idx(i, j, k);
    if (ext[id] || dist[id]! < r) return;
    ext[id] = 1;
    stack[sp++] = id;
  };
  for (let k = 0; k < g.nz; k++)
    for (let j = 0; j < g.ny; j++) {
      push(0, j, k);
      push(g.nx - 1, j, k);
    }
  for (let k = 0; k < g.nz; k++)
    for (let i = 0; i < g.nx; i++) {
      push(i, 0, k);
      push(i, g.ny - 1, k);
    }
  for (let j = 0; j < g.ny; j++)
    for (let i = 0; i < g.nx; i++) {
      push(i, j, 0);
      push(i, j, g.nz - 1);
    }
  while (sp > 0) {
    const id = stack[--sp]!;
    const i = id % g.nx;
    const j = Math.floor(id / g.nx) % g.ny;
    const k = Math.floor(id / (g.nx * g.ny));
    if (i > 0) push(i - 1, j, k);
    if (i < g.nx - 1) push(i + 1, j, k);
    if (j > 0) push(i, j - 1, k);
    if (j < g.ny - 1) push(i, j + 1, k);
    if (k > 0) push(i, j, k - 1);
    if (k < g.nz - 1) push(i, j, k + 1);
  }
  return ext;
}

/**
 * Distanza con segno di un solido descritto da una mesh (anche con piccoli fori).
 * Vicino alla superficie (dist < r) il segno viene dalla normale del triangolo più vicino,
 * altrove dalla maschera esterno/interno.
 */
export function solidSdf(g: Grid, m: TriMesh, band: number, r: number, outward: 1 | -1): Float32Array {
  const { dist, tri } = unsignedBand(g, m, band);
  const ext = exteriorMask(g, dist, r);
  const sd = new Float32Array(g.count);
  const p = m.positions;
  for (let k = 0; k < g.nz; k++)
    for (let j = 0; j < g.ny; j++)
      for (let i = 0; i < g.nx; i++) {
        const id = g.idx(i, j, k);
        const d = dist[id]!;
        let s = ext[id] ? 1 : -1;
        const t = tri[id]!;
        if (d < r && t >= 0) {
          const a = m.indices[t * 3]! * 3;
          const b = m.indices[t * 3 + 1]! * 3;
          const c = m.indices[t * 3 + 2]! * 3;
          const ux = p[b]! - p[a]!,
            uy = p[b + 1]! - p[a + 1]!,
            uz = p[b + 2]! - p[a + 2]!;
          const vx = p[c]! - p[a]!,
            vy = p[c + 1]! - p[a + 1]!,
            vz = p[c + 2]! - p[a + 2]!;
          const nx = uy * vz - uz * vy,
            ny = uz * vx - ux * vz,
            nz = ux * vy - uy * vx;
          const x = g.origin[0] + i * g.h - (p[a]! + p[b]! + p[c]!) / 3;
          const y = g.origin[1] + j * g.h - (p[a + 1]! + p[b + 1]! + p[c + 1]!) / 3;
          const z = g.origin[2] + k * g.h - (p[a + 2]! + p[b + 2]! + p[c + 2]!) / 3;
          const dotn = (x * nx + y * ny + z * nz) * outward;
          // Nel guscio di chiusura il voxel è interno solo se la normale lo conferma
          if (!ext[id]) s = dotn > 0 ? 1 : -1;
        }
        sd[id] = s * d;
      }
  return sd;
}

/** Guscio (parete) attorno a una superficie aperta: |d| − spessore/2. */
export function shellSdf(g: Grid, m: TriMesh, halfThickness: number, band: number): Float32Array {
  const { dist } = unsignedBand(g, m, band);
  for (let i = 0; i < dist.length; i++) dist[i] = dist[i]! - halfThickness;
  return dist;
}

/** Media mobile 3×3×3 (leviga il campo). */
export function blur(g: Grid, f: Float32Array, passes = 1): Float32Array {
  let src = f;
  for (let p = 0; p < passes; p++) {
    const dst = new Float32Array(src.length);
    for (let axis = 0; axis < 3; axis++) {
      const stride = axis === 0 ? 1 : axis === 1 ? g.nx : g.nx * g.ny;
      const n = axis === 0 ? g.nx : axis === 1 ? g.ny : g.nz;
      const from = axis === 0 ? src : dst.slice();
      for (let id = 0; id < src.length; id++) {
        const c =
          axis === 0 ? id % g.nx : axis === 1 ? Math.floor(id / g.nx) % g.ny : Math.floor(id / (g.nx * g.ny));
        const a = c > 0 ? from[id - stride]! : from[id]!;
        const b = c < n - 1 ? from[id + stride]! : from[id]!;
        dst[id] = 0.25 * a + 0.5 * from[id]! + 0.25 * b;
      }
    }
    src = dst;
  }
  return src;
}

/**
 * Rimuove i "tappi" alle giunzioni tra segmenti di uno stesso vaso (BodyParts3D chiude ogni segmento):
 * si eliminano i triangoli di ciascun segmento che giacciono sulla superficie di un segmento adiacente.
 */
export function removeJunctionCaps(g: Grid, parts: TriMesh[], tol = 0.9): TriMesh[] {
  const bands = parts.map((m) => unsignedBand(g, m, 2).dist);
  return parts.map((m, pi) => {
    const keep: number[] = [];
    const p = m.positions;
    for (let t = 0; t < m.indices.length; t += 3) {
      let onOther = true;
      for (let q = 0; q < 3 && onOther; q++) {
        const v = m.indices[t + q]! * 3;
        let d = Infinity;
        for (let oj = 0; oj < parts.length; oj++) {
          if (oj === pi) continue;
          d = Math.min(d, g.sample(bands[oj]!, p[v]!, p[v + 1]!, p[v + 2]!));
        }
        if (d > tol) onOther = false;
      }
      if (!onOther) keep.push(m.indices[t]!, m.indices[t + 1]!, m.indices[t + 2]!);
    }
    return { positions: m.positions, indices: new Uint32Array(keep) };
  });
}

/** Riorienta i triangoli in modo che le normali puntino verso l'esterno (volume con segno positivo). */
export function orientOutward(m: TriMesh): TriMesh {
  let v = 0;
  const p = m.positions;
  for (let t = 0; t < m.indices.length; t += 3) {
    const a = m.indices[t]! * 3;
    const b = m.indices[t + 1]! * 3;
    const c = m.indices[t + 2]! * 3;
    v +=
      p[a]! * (p[b + 1]! * p[c + 2]! - p[b + 2]! * p[c + 1]!) -
      p[a + 1]! * (p[b]! * p[c + 2]! - p[b + 2]! * p[c]!) +
      p[a + 2]! * (p[b]! * p[c + 1]! - p[b + 1]! * p[c]!);
  }
  if (v >= 0) return m;
  const idx = new Uint32Array(m.indices.length);
  for (let t = 0; t < idx.length; t += 3) {
    idx[t] = m.indices[t]!;
    idx[t + 1] = m.indices[t + 2]!;
    idx[t + 2] = m.indices[t + 1]!;
  }
  return { positions: m.positions, indices: idx };
}

/**
 * Distanza con segno di un lume vascolare anche aperto: il segno è dato dalla normale (uscente) del
 * triangolo più vicino, quindi funziona con estremità aperte. Negativa dentro il lume.
 */
export function lumenSdf(g: Grid, m: TriMesh, band: number): Float32Array {
  const { dist, tri } = unsignedBand(g, m, band);
  const p = m.positions;
  const sd = new Float32Array(g.count);
  for (let k = 0; k < g.nz; k++)
    for (let j = 0; j < g.ny; j++)
      for (let i = 0; i < g.nx; i++) {
        const id = g.idx(i, j, k);
        const t = tri[id]!;
        if (t < 0) {
          sd[id] = band;
          continue;
        }
        const a = m.indices[t * 3]! * 3;
        const b = m.indices[t * 3 + 1]! * 3;
        const c = m.indices[t * 3 + 2]! * 3;
        const ux = p[b]! - p[a]!,
          uy = p[b + 1]! - p[a + 1]!,
          uz = p[b + 2]! - p[a + 2]!;
        const vx = p[c]! - p[a]!,
          vy = p[c + 1]! - p[a + 1]!,
          vz = p[c + 2]! - p[a + 2]!;
        const nx = uy * vz - uz * vy,
          ny = uz * vx - ux * vz,
          nz = ux * vy - uy * vx;
        const x = g.origin[0] + i * g.h - (p[a]! + p[b]! + p[c]!) / 3;
        const y = g.origin[1] + j * g.h - (p[a + 1]! + p[b + 1]! + p[c + 1]!) / 3;
        const z = g.origin[2] + k * g.h - (p[a + 2]! + p[b + 2]! + p[c + 2]!) / 3;
        sd[id] = (x * nx + y * ny + z * nz >= 0 ? 1 : -1) * dist[id]!;
      }
  return sd;
}
