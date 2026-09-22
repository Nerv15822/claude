/**
 * Costruzione della mesh del cuore procedurale (eseguita in un Web Worker).
 * Produce buffer "grezzi" (nessuna dipendenza da three.js) con gli attributi per la deformazione:
 *   aChamber (pesi VS, VD, AS, AD), aVessel (aorta, AP, vene sistemiche, vene polmonari),
 *   aAxis (punto sull'asse del vaso più vicino), color (miocardio, grasso nei solchi, vasi, coronarie).
 */
import { evalRegions, G, GROUPS, SHORT_A, SHORT_S, LONG_AXIS, BASE, BOUNDS, heartSdf } from './anatomy';
import { add, cross, dot, len, norm, scale, sub, type Vec3 } from './sdf';
import { surfaceNets } from './surfaceNets';

export interface HeartBuffers {
  position: Float32Array;
  normal: Float32Array;
  color: Float32Array;
  aChamber: Float32Array;
  aVessel: Float32Array;
  aAxis: Float32Array;
  index: Uint32Array;
}

const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const hex = (h: number): Vec3 => [
  srgbToLinear(((h >> 16) & 255) / 255),
  srgbToLinear(((h >> 8) & 255) / 255),
  srgbToLinear((h & 255) / 255),
];

const MYO = hex(0x7a1d18);
const ATRIAL = hex(0x6e2422);
const FAT = hex(0xd9b867);
const AORTA_C = hex(0xd9a79a);
const PA_C = hex(0xb897ad);
const VEIN_C = hex(0x6a3b52);
const PVEIN_C = hex(0x8a4a50);
const CORONARY = hex(0xb02a22);

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

/** Temperatura (cm) del softmax delle distanze per i pesi di regione. */
const TAU = 0.35;

const regions = new Float64Array(GROUPS);
const weights = new Float64Array(GROUPS);

function regionWeights(p: Vec3, axis: Vec3): number {
  const d = evalRegions(p, regions, axis);
  let min = Infinity;
  for (let i = 0; i < GROUPS; i++) min = Math.min(min, regions[i]!);
  let sum = 0;
  for (let i = 0; i < GROUPS; i++) {
    const w = Math.exp(-(regions[i]! - min) / TAU);
    weights[i] = w;
    sum += w;
  }
  for (let i = 0; i < GROUPS; i++) weights[i] = weights[i]! / sum;
  return d;
}

function gradient(p: Vec3): Vec3 {
  const e = 0.02;
  return norm([
    heartSdf([p[0] + e, p[1], p[2]]) - heartSdf([p[0] - e, p[1], p[2]]),
    heartSdf([p[0], p[1] + e, p[2]]) - heartSdf([p[0], p[1] - e, p[2]]),
    heartSdf([p[0], p[1], p[2] + e]) - heartSdf([p[0], p[1], p[2] - e]),
  ]);
}

function surfaceColor(): Vec3 {
  const w = weights;
  const wv = w[G.LV]! + w[G.RV]!;
  const wa = w[G.LA]! + w[G.RA]!;
  const wves = w[G.AORTA]! + w[G.PA]!;
  // Grasso epicardico: solco atrioventricolare, solchi interventricolari, radice dei grandi vasi
  const fatAV = smoothstep(0.45, 0.95, 4 * wv * wa);
  const fatIV = smoothstep(0.55, 0.98, 4 * w[G.LV]! * w[G.RV]!);
  const fatRoot = smoothstep(0.5, 0.95, 4 * wv * wves) * 0.6;
  const fat = 0.85 * Math.max(fatAV, fatIV, fatRoot);
  const c: Vec3 = [0, 0, 0];
  const mix = (col: Vec3, k: number) => {
    c[0] += col[0] * k;
    c[1] += col[1] * k;
    c[2] += col[2] * k;
  };
  mix(MYO, wv);
  mix(ATRIAL, wa);
  mix(AORTA_C, w[G.AORTA]!);
  mix(PA_C, w[G.PA]!);
  mix(VEIN_C, w[G.SYS_VEINS]!);
  mix(PVEIN_C, w[G.PULM_VEINS]!);
  return [c[0] * (1 - fat) + FAT[0] * fat, c[1] * (1 - fat) + FAT[1] * fat, c[2] * (1 - fat) + FAT[2] * fat];
}

/** Proiezione sulla superficie lungo un raggio che parte dall'esterno verso `origin`. */
function castToSurface(origin: Vec3, dir: Vec3): Vec3 | null {
  let t = 12;
  for (let i = 0; i < 128; i++) {
    const p = add(origin, scale(dir, t));
    const d = heartSdf(p);
    if (Math.abs(d) < 0.003) return p;
    t -= Math.max(d, 0.01) * (d > 0 ? 0.9 : -0.5);
    if (t < 0) return null;
  }
  return null;
}

const dirAt = (phiDeg: number): Vec3 => {
  const f = (phiDeg * Math.PI) / 180;
  return add(scale(SHORT_A, Math.cos(f)), scale(SHORT_S, Math.sin(f)));
};
const axisPoint = (h: number): Vec3 => add(BASE, scale(LONG_AXIS, h));

/** Solco interventricolare: minimizza |d_VS − d_VD| su un arco di angoli, per ogni livello dell'asse. */
function interventricularGroove(hs: number[], phiMin: number, phiMax: number): Vec3[] {
  const pts: Vec3[] = [];
  const axis: Vec3 = [0, 0, 0];
  for (const h of hs) {
    let best: Vec3 | null = null;
    let score = Infinity;
    for (let phi = phiMin; phi <= phiMax; phi += 2) {
      const p = castToSurface(axisPoint(h), dirAt(phi));
      if (!p) continue;
      evalRegions(p, regions, axis);
      const s = Math.abs(regions[G.LV]! - regions[G.RV]!);
      if (s < score) {
        score = s;
        best = p;
      }
    }
    if (best) pts.push(best);
  }
  return pts;
}

/** Solco atrioventricolare: per ogni angolo cerca il livello dove ventricoli e atri si incontrano. */
function avGroove(phis: number[]): Vec3[] {
  const pts: Vec3[] = [];
  for (const phi of phis) {
    let best: Vec3 | null = null;
    let score = Infinity;
    for (let h = -2.6; h <= 2.6; h += 0.1) {
      const p = castToSurface(axisPoint(h), dirAt(phi));
      if (!p) continue;
      evalRegions(p, regions);
      const dv = Math.min(regions[G.LV]!, regions[G.RV]!);
      const da = Math.min(regions[G.LA]!, regions[G.RA]!);
      const dves = Math.min(regions[G.AORTA]!, regions[G.PA]!);
      const s = Math.abs(dv - da) + (dves < 0.4 ? 5 : 0);
      if (s < score) {
        score = s;
        best = p;
      }
    }
    if (best && score < 2) pts.push(best);
  }
  return pts;
}

function smooth(pts: Vec3[], passes = 3): Vec3[] {
  let cur = pts;
  for (let k = 0; k < passes; k++) {
    cur = cur.map((p, i) => {
      if (i === 0 || i === cur.length - 1) return p;
      return scale(add(add(cur[i - 1]!, scale(p, 2)), cur[i + 1]!), 0.25);
    });
  }
  return cur;
}

const range = (a: number, b: number, n: number) =>
  Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1));

interface TubeOut {
  pos: number[];
  nrm: number[];
  idx: number[];
}

/** Tubo (coronaria) lungo una polilinea, adagiato sulla superficie epicardica. */
function buildTube(center: Vec3[], r0: number, r1: number, out: TubeOut, radial = 8): void {
  if (center.length < 2) return;
  const base = out.pos.length / 3;
  // Ogni punto sollevato leggermente lungo la normale della superficie
  const lifted = center.map((p) => add(p, scale(gradient(p), 0.06)));
  let prevN: Vec3 = gradient(lifted[0]!);
  for (let i = 0; i < lifted.length; i++) {
    const a = lifted[Math.max(i - 1, 0)]!;
    const b = lifted[Math.min(i + 1, lifted.length - 1)]!;
    const t = norm(sub(b, a));
    let n = sub(prevN, scale(t, dot(prevN, t)));
    n = len(n) < 1e-6 ? norm(cross(t, [0, 1, 0])) : norm(n);
    prevN = n;
    const bn = cross(t, n);
    const r = r0 + ((r1 - r0) * i) / (lifted.length - 1);
    for (let k = 0; k < radial; k++) {
      const ang = (k / radial) * Math.PI * 2;
      const dir = add(scale(n, Math.cos(ang)), scale(bn, Math.sin(ang)));
      const p = add(lifted[i]!, scale(dir, r));
      out.pos.push(p[0], p[1], p[2]);
      out.nrm.push(dir[0], dir[1], dir[2]);
    }
  }
  for (let i = 0; i < lifted.length - 1; i++) {
    for (let k = 0; k < radial; k++) {
      const a = base + i * radial + k;
      const b = base + i * radial + ((k + 1) % radial);
      const c = a + radial;
      const d = b + radial;
      out.idx.push(a, b, c, b, d, c);
    }
  }
}

/** Genera la geometria completa. `cell` = risoluzione (cm): 0.18 alta, 0.26 media, 0.34 bassa. */
export function buildHeartGeometry(cell = 0.22): HeartBuffers {
  const nets = surfaceNets((x, y, z) => heartSdf([x, y, z]), { min: BOUNDS.min, max: BOUNDS.max, cell });

  // Coronarie
  const tubes: TubeOut = { pos: [], nrm: [], idx: [] };
  const lad = smooth(interventricularGroove(range(1.2, 8.9, 26), -60, 60));
  const pda = smooth(interventricularGroove(range(2.0, 7.4, 18), 125, 235));
  const rca = smooth(avGroove(range(-25, -178, 30)));
  const lcx = smooth(avGroove(range(55, 165, 22)));
  buildTube(lad, 0.24, 0.1, tubes);
  buildTube(pda, 0.17, 0.09, tubes);
  buildTube(rca, 0.25, 0.15, tubes);
  buildTube(lcx, 0.22, 0.12, tubes);

  const nHeart = nets.positions.length / 3;
  const nTube = tubes.pos.length / 3;
  const n = nHeart + nTube;
  const position = new Float32Array(n * 3);
  const normal = new Float32Array(n * 3);
  const color = new Float32Array(n * 3);
  const aChamber = new Float32Array(n * 4);
  const aVessel = new Float32Array(n * 4);
  const aAxis = new Float32Array(n * 3);
  const axis: Vec3 = [0, 0, 0];

  for (let i = 0; i < n; i++) {
    const heart = i < nHeart;
    const p: Vec3 = heart
      ? [nets.positions[i * 3]!, nets.positions[i * 3 + 1]!, nets.positions[i * 3 + 2]!]
      : [tubes.pos[(i - nHeart) * 3]!, tubes.pos[(i - nHeart) * 3 + 1]!, tubes.pos[(i - nHeart) * 3 + 2]!];
    regionWeights(p, axis);
    const nr: Vec3 = heart
      ? gradient(p)
      : [tubes.nrm[(i - nHeart) * 3]!, tubes.nrm[(i - nHeart) * 3 + 1]!, tubes.nrm[(i - nHeart) * 3 + 2]!];
    const c = heart ? surfaceColor() : CORONARY;
    position.set(p, i * 3);
    normal.set(nr, i * 3);
    color.set(c, i * 3);
    aChamber.set([weights[G.LV]!, weights[G.RV]!, weights[G.LA]!, weights[G.RA]!], i * 4);
    aVessel.set([weights[G.AORTA]!, weights[G.PA]!, weights[G.SYS_VEINS]!, weights[G.PULM_VEINS]!], i * 4);
    aAxis.set(axis, i * 3);
  }
  const index = new Uint32Array(nets.indices.length + tubes.idx.length);
  index.set(nets.indices, 0);
  for (let i = 0; i < tubes.idx.length; i++) index[nets.indices.length + i] = tubes.idx[i]! + nHeart;
  return { position, normal, color, aChamber, aVessel, aAxis, index };
}
