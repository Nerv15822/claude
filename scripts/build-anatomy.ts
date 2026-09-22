/**
 * Costruisce il modello anatomico del cuore da BodyParts3D (DBCLS, CC BY 4.0).
 *
 *   npx tsx scripts/build-anatomy.ts <cartella con gli OBJ di partof_BP3D_4.0_obj_99>
 *
 * BodyParts3D non contiene la superficie epicardica dei ventricoli (solo cavità, pareti atriali,
 * valvole, vasi e coronarie). L'epicardio ventricolare viene ricostruito come offset delle cavità reali
 * dello spessore di parete fisiologico (VS ~10 mm, 6–7 mm all'apice; VD ~4 mm), unito alle pareti
 * atriali e ai grandi vasi reali tramite campi di distanza su griglia a 1 mm. Le coronarie e le vene
 * cardiache reali vengono aggiunte come mesh separate.
 * Output: public/models/heart-bp3d.json + .bin (stesso layout di attributi del modello procedurale).
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { MeshoptSimplifier } from 'meshoptimizer';
import { surfaceNets } from '../src/scene/heart/surfaceNets';
import { mergeMeshes, readObj, signedVolume, type TriMesh } from './anatomy/obj';
import { Grid, blur, shellSdf, solidSdf } from './anatomy/voxel';

const dir = process.argv[2];
if (!dir) throw new Error('Specificare la cartella degli OBJ BodyParts3D');
const load = (...ids: string[]): TriMesh => mergeMeshes(ids.map((id) => readObj(join(dir, `${id}.obj`))));

const t0 = performance.now();
const log = (msg: string) => console.log(`[${((performance.now() - t0) / 1000).toFixed(1)} s] ${msg}`);

// ---------------------------------------------------------------- parti anatomiche (FMA → FJ)
const LV_CAVITY = load('FJ2422');
const RV_CAVITY = load('FJ2423');
const LA_WALL = load('FJ2438');
const RA_WALL = load('FJ2439');
const MITRAL = load('FJ2420', 'FJ2432');
const AORTA = load('FJ3413', 'FJ3411', 'FJ1931', 'FJ3417', 'FJ3479', 'FJ3483');
const PULM_ART = load('FJ2966', 'FJ2924', 'FJ3019');
const CAVAE = load('FJ3645', 'FJ3441');
const PULM_VEINS = load('FJ2925', 'FJ2933', 'FJ2944', 'FJ2950', 'FJ2955', 'FJ3020', 'FJ3040');
const CORONARY_ART = load(
  'FJ2737',
  'FJ2631',
  'FJ2632',
  'FJ2633',
  'FJ2634',
  'FJ2635',
  'FJ2636',
  'FJ2637',
  'FJ2638',
  'FJ2639',
  'FJ2640',
  'FJ2641',
  'FJ2642',
  'FJ2643',
  'FJ2644',
  'FJ2645',
  'FJ2646',
  'FJ2647',
  'FJ2648',
  'FJ2649',
  'FJ2650',
  'FJ2651',
  'FJ2652',
  'FJ2653',
  'FJ2654',
  'FJ2723',
  'FJ2667',
  'FJ2668',
  'FJ2670',
  'FJ2671',
  'FJ2672',
  'FJ2673',
  'FJ2674',
  'FJ2675',
  'FJ2676',
  'FJ2677',
  'FJ2692',
  'FJ2693',
  'FJ2694',
  'FJ2695',
  'FJ2696',
  'FJ2697',
  'FJ2698',
  'FJ2699',
  'FJ2700',
  'FJ2714',
  'FJ2715',
  'FJ2716',
  'FJ2717',
  'FJ2718',
  'FJ2719',
  'FJ2720',
  'FJ2721',
  'FJ2722',
);
const CARDIAC_VEINS = load(
  'FJ2655',
  'FJ2656',
  'FJ2678',
  'FJ2679',
  'FJ2680',
  'FJ2681',
  'FJ2682',
  'FJ2683',
  'FJ2684',
  'FJ2685',
  'FJ2686',
  'FJ2687',
  'FJ2688',
  'FJ2689',
  'FJ2690',
  'FJ2691',
  'FJ2701',
  'FJ2702',
  'FJ2703',
  'FJ2704',
  'FJ2705',
  'FJ2706',
  'FJ2707',
  'FJ2708',
  'FJ2709',
  'FJ2710',
  'FJ2711',
  'FJ2712',
  'FJ2713',
  'FJ2724',
  'FJ2727',
  'FJ2728',
  'FJ2729',
  'FJ2731',
);
log('OBJ caricati');

// Orientamento delle normali (volume con segno positivo = normali verso l'esterno)
const orient = (m: TriMesh): 1 | -1 => (signedVolume(m) >= 0 ? 1 : -1);

// ---------------------------------------------------------------- griglia (mm, coordinate BP3D)
// BP3D: x = sinistra del paziente, y = posteriore (anteriore = −y), z = craniale
const CLIP = { min: [-42, -182, 1165] as const, max: [80, -46, 1336] as const };
const g = new Grid([-46, -186, 1146], [142, 144, 198], 1);
log(`griglia ${g.nx}×${g.ny}×${g.nz}`);

const lvCav = solidSdf(g, LV_CAVITY, 14, 2.5, orient(LV_CAVITY));
const rvCav = solidSdf(g, RV_CAVITY, 8, 2.5, orient(RV_CAVITY));
log('cavità ventricolari');
const la = solidSdf(g, LA_WALL, 6, 3, orient(LA_WALL));
const ra = solidSdf(g, RA_WALL, 6, 3, orient(RA_WALL));
log('atri');
const ao = shellSdf(g, AORTA, 1.1, 6);
const pa = shellSdf(g, PULM_ART, 1.0, 6);
const cav = shellSdf(g, CAVAE, 0.9, 6);
const pv = shellSdf(g, PULM_VEINS, 0.8, 6);
log('vasi');

// Asse del VS: centro dell'anulus mitralico → apice (punto della cavità più lontano)
const centroid = (m: TriMesh) => {
  const c = [0, 0, 0];
  const n = m.positions.length / 3;
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) c[k]! += m.positions[i * 3 + k]! / n;
  return c as [number, number, number];
};
const mitralCenter = centroid(MITRAL);
let apex: [number, number, number] = [0, 0, 0];
let far = 0;
for (let i = 0; i < LV_CAVITY.positions.length / 3; i++) {
  const p = [0, 1, 2].map((k) => LV_CAVITY.positions[i * 3 + k]!) as [number, number, number];
  const d = Math.hypot(p[0] - mitralCenter[0], p[1] - mitralCenter[1], p[2] - mitralCenter[2]);
  if (d > far) {
    far = d;
    apex = p;
  }
}
const axis = [0, 1, 2].map((k) => (apex[k]! - mitralCenter[k]!) / far) as [number, number, number];
log(`asse VS: lunghezza cavità ${far.toFixed(1)} mm`);

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};
const smin = (a: number, b: number, k: number) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};

// ---------------------------------------------------------------- composizione
const N = g.count;
const lvEpi = new Float32Array(N);
const rvEpi = new Float32Array(N);
const full = new Float32Array(N);
for (let k = 0; k < g.nz; k++)
  for (let j = 0; j < g.ny; j++)
    for (let i = 0; i < g.nx; i++) {
      const id = g.idx(i, j, k);
      const x = g.origin[0] + i;
      const y = g.origin[1] + j;
      const z = g.origin[2] + k;
      const t =
        ((x - mitralCenter[0]) * axis[0] +
          (y - mitralCenter[1]) * axis[1] +
          (z - mitralCenter[2]) * axis[2]) /
        far;
      // Spessore di parete del VS: ~10 mm alla base e medioventricolare, ~6.5 mm all'apice
      const thick = 10 - 3.5 * smoothstep(0.6, 1.02, t);
      lvEpi[id] = lvCav[id]! - thick;
      rvEpi[id] = rvCav[id]! - 4;
      let d = smin(lvEpi[id]!, rvEpi[id]!, 4);
      d = smin(d, Math.min(la[id]!, ra[id]!), 4);
      const vessels = Math.min(ao[id]!, pa[id]!, cav[id]!, pv[id]!);
      d = smin(d, vessels, 2.5);
      // Ritaglio dei vasi (estremità sezionate)
      const box = Math.max(
        CLIP.min[0] - x,
        x - CLIP.max[0],
        CLIP.min[1] - y,
        y - CLIP.max[1],
        CLIP.min[2] - z,
        z - CLIP.max[2],
      );
      full[id] = Math.max(d, box);
    }
const field = blur(g, full, 1);
log('composizione');

// ---------------------------------------------------------------- estrazione e semplificazione
const nets = surfaceNets((x, y, z) => g.sample(field, x, y, z), {
  min: [g.origin[0], g.origin[1], g.origin[2]],
  max: [g.origin[0] + g.size[0], g.origin[1] + g.size[1], g.origin[2] + g.size[2]],
  cell: 1,
});
log(`surface nets: ${nets.positions.length / 3} vertici, ${nets.indices.length / 3} triangoli`);

await MeshoptSimplifier.ready;

/** Rimuove le componenti connesse piccole (frammenti di vasi al bordo del ritaglio). */
function largestComponents(m: { positions: Float32Array; indices: Uint32Array }, minFraction: number) {
  const n = m.positions.length / 3;
  const parent = new Int32Array(n).map((_, i) => i);
  const find = (a: number): number => {
    while (parent[a] !== a) {
      parent[a] = parent[parent[a]!]!;
      a = parent[a]!;
    }
    return a;
  };
  for (let t = 0; t < m.indices.length; t += 3) {
    const a = find(m.indices[t]!);
    parent[find(m.indices[t + 1]!)] = a;
    parent[find(m.indices[t + 2]!)] = a;
  }
  const count = new Map<number, number>();
  for (let i = 0; i < n; i++) count.set(find(i), (count.get(find(i)) ?? 0) + 1);
  const keep = new Set([...count].filter(([, c]) => c >= n * minFraction).map(([r]) => r));
  const remap = new Int32Array(n).fill(-1);
  const pos: number[] = [];
  const idx: number[] = [];
  for (let t = 0; t < m.indices.length; t += 3) {
    if (!keep.has(find(m.indices[t]!))) continue;
    for (let q = 0; q < 3; q++) {
      const v = m.indices[t + q]!;
      if (remap[v] === -1) {
        remap[v] = pos.length / 3;
        pos.push(m.positions[v * 3]!, m.positions[v * 3 + 1]!, m.positions[v * 3 + 2]!);
      }
      idx.push(remap[v]!);
    }
  }
  return { positions: new Float32Array(pos), indices: new Uint32Array(idx) };
}
function simplify(pos: Float32Array, idx: Uint32Array, ratio: number, error: number) {
  const [out] = MeshoptSimplifier.simplify(idx, pos, 3, Math.floor((idx.length * ratio) / 3) * 3, error, []);
  // Compattazione dei vertici usati
  const remap = new Int32Array(pos.length / 3).fill(-1);
  const np: number[] = [];
  const ni = new Uint32Array(out.length);
  for (let i = 0; i < out.length; i++) {
    const v = out[i]!;
    if (remap[v] === -1) {
      remap[v] = np.length / 3;
      np.push(pos[v * 3]!, pos[v * 3 + 1]!, pos[v * 3 + 2]!);
    }
    ni[i] = remap[v]!;
  }
  return { positions: new Float32Array(np), indices: ni };
}
const heart = largestComponents(simplify(nets.positions, nets.indices, 0.14, 0.006), 0.02);
log(`cuore semplificato: ${heart.positions.length / 3} vertici`);
const toF32 = (m: TriMesh) => ({ positions: new Float32Array(m.positions), indices: m.indices });
const coronary = simplify(toF32(CORONARY_ART).positions, CORONARY_ART.indices, 0.35, 0.02);
const veins = simplify(toF32(CARDIAC_VEINS).positions, CARDIAC_VEINS.indices, 0.35, 0.02);
log(`coronarie ${coronary.positions.length / 3} v, vene ${veins.positions.length / 3} v`);

// Posizione delle coronarie rispetto all'epicardio ricostruito (controllo di coerenza)
{
  const ds: number[] = [];
  for (let i = 0; i < coronary.positions.length; i += 3)
    ds.push(g.sample(field, coronary.positions[i]!, coronary.positions[i + 1]!, coronary.positions[i + 2]!));
  ds.sort((a, b) => a - b);
  const q = (f: number) => ds[Math.floor(f * (ds.length - 1))]!.toFixed(1);
  log(`SDF epicardio ai vertici coronarici (mm): p10 ${q(0.1)} · mediana ${q(0.5)} · p90 ${q(0.9)}`);
}

// ---------------------------------------------------------------- attributi
const GROUPS = 8;
const fields = [lvEpi, rvEpi, la, ra, ao, pa, cav, pv];
const TAU = 3.0;
const srgb = (h: number) =>
  [16, 8, 0].map((s) => {
    const c = ((h >> s) & 255) / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
const COLORS = {
  myo: srgb(0x7a1d18),
  atrial: srgb(0x6e2422),
  fat: srgb(0xd9b867),
  aorta: srgb(0xd9a79a),
  pa: srgb(0xb897ad),
  vein: srgb(0x6a3b52),
  pvein: srgb(0x8a4a50),
  coronary: srgb(0xb02a22),
  cvein: srgb(0x4a2440),
};

// Distanza dalle coronarie e vene (per il grasso epicardico che le accompagna nei solchi)
const vesselPts = [coronary.positions, veins.positions];
const vesselGrid = new Map<string, number[]>();
for (const arr of vesselPts)
  for (let i = 0; i < arr.length; i += 3) {
    const key = `${Math.floor(arr[i]! / 6)},${Math.floor(arr[i + 1]! / 6)},${Math.floor(arr[i + 2]! / 6)}`;
    const list = vesselGrid.get(key) ?? [];
    list.push(arr[i]!, arr[i + 1]!, arr[i + 2]!);
    vesselGrid.set(key, list);
  }
function distToCoronary(x: number, y: number, z: number): number {
  let best = 1e9;
  const cx = Math.floor(x / 6);
  const cy = Math.floor(y / 6);
  const cz = Math.floor(z / 6);
  for (let a = -2; a <= 2; a++)
    for (let b = -2; b <= 2; b++)
      for (let c = -2; c <= 2; c++) {
        const list = vesselGrid.get(`${cx + a},${cy + b},${cz + c}`);
        if (!list) continue;
        for (let i = 0; i < list.length; i += 3) {
          const d = Math.hypot(list[i]! - x, list[i + 1]! - y, list[i + 2]! - z);
          if (d < best) best = d;
        }
      }
  return best;
}

interface Part {
  positions: Float32Array;
  indices: Uint32Array;
  kind: 'heart' | 'coronary' | 'vein';
}
const parts: Part[] = [
  { ...heart, kind: 'heart' },
  { ...coronary, kind: 'coronary' },
  { ...veins, kind: 'vein' },
];
const total = parts.reduce((a, p) => a + p.positions.length / 3, 0);
const out = {
  position: new Float32Array(total * 3),
  normal: new Float32Array(total * 3),
  color: new Float32Array(total * 3),
  aChamber: new Float32Array(total * 4),
  aVessel: new Float32Array(total * 4),
  aAxis: new Float32Array(total * 3),
  aSurface: new Float32Array(total * 2),
};
const indexList: number[] = [];

// Conversione BP3D (mm) → scena (cm): X = x, Y = z, Z = −y, ricentrata
const CENTER_MM = [25, -118, 1235];
const toScene = (x: number, y: number, z: number): [number, number, number] => [
  (x - CENTER_MM[0]!) / 10,
  (z - CENTER_MM[2]!) / 10,
  -(y - CENTER_MM[1]!) / 10,
];

const grad = (f: Float32Array, x: number, y: number, z: number) => {
  const e = 0.6;
  const gx = g.sample(f, x + e, y, z) - g.sample(f, x - e, y, z);
  const gy = g.sample(f, x, y + e, z) - g.sample(f, x, y - e, z);
  const gz = g.sample(f, x, y, z + e) - g.sample(f, x, y, z - e);
  const l = Math.hypot(gx, gy, gz) || 1;
  return [gx / l, gy / l, gz / l];
};

let vOff = 0;
const w = new Float64Array(GROUPS);
for (const part of parts) {
  const n = part.positions.length / 3;
  // Normali per vertice dalla mesh (vasi coronarici) o dal campo (cuore)
  const vn = new Float32Array(n * 3);
  if (part.kind !== 'heart') {
    for (let t = 0; t < part.indices.length; t += 3) {
      const a = part.indices[t]!,
        b = part.indices[t + 1]!,
        c = part.indices[t + 2]!;
      const P = part.positions;
      const ux = P[b * 3]! - P[a * 3]!,
        uy = P[b * 3 + 1]! - P[a * 3 + 1]!,
        uz = P[b * 3 + 2]! - P[a * 3 + 2]!;
      const vx = P[c * 3]! - P[a * 3]!,
        vy = P[c * 3 + 1]! - P[a * 3 + 1]!,
        vz = P[c * 3 + 2]! - P[a * 3 + 2]!;
      const nx = uy * vz - uz * vy,
        ny = uz * vx - ux * vz,
        nz = ux * vy - uy * vx;
      for (const v of [a, b, c]) {
        vn[v * 3] = vn[v * 3]! + nx;
        vn[v * 3 + 1] = vn[v * 3 + 1]! + ny;
        vn[v * 3 + 2] = vn[v * 3 + 2]! + nz;
      }
    }
  }
  for (let i = 0; i < n; i++) {
    const x = part.positions[i * 3]!,
      y = part.positions[i * 3 + 1]!,
      z = part.positions[i * 3 + 2]!;
    let min = Infinity;
    for (let gi = 0; gi < GROUPS; gi++) {
      w[gi] = g.sample(fields[gi]!, x, y, z);
      min = Math.min(min, w[gi]!);
    }
    let sum = 0;
    for (let gi = 0; gi < GROUPS; gi++) {
      w[gi] = Math.exp(-(w[gi]! - min) / TAU);
      sum += w[gi]!;
    }
    for (let gi = 0; gi < GROUPS; gi++) w[gi] = w[gi]! / sum;
    let nrm: number[];
    if (part.kind === 'heart') nrm = grad(field, x, y, z);
    else {
      const l = Math.hypot(vn[i * 3]!, vn[i * 3 + 1]!, vn[i * 3 + 2]!) || 1;
      nrm = [vn[i * 3]! / l, vn[i * 3 + 1]! / l, vn[i * 3 + 2]! / l];
    }
    // Asse del vaso: si scende lungo −n fino al massimo della distanza dalla parete del vaso dominante
    const vesselField = w[4]! >= w[5]! ? ao : pa;
    let axisP = [x, y, z];
    if (w[4]! + w[5]! > 0.05 && part.kind === 'heart') {
      let best = -1e9;
      for (let s = 0.5; s < 22; s += 0.5) {
        const px = x - nrm[0]! * s,
          py = y - nrm[1]! * s,
          pz = z - nrm[2]! * s;
        const d = -g.sample(vesselField, px, py, pz);
        if (d > best) {
          best = d;
          axisP = [px, py, pz];
        }
      }
    }
    // Colore
    let col: number[];
    let fat = 0;
    let kind = 0;
    if (part.kind === 'coronary') {
      col = COLORS.coronary;
      kind = 3;
    } else if (part.kind === 'vein') {
      col = COLORS.cvein;
      kind = 4;
    } else {
      const wv = w[0]! + w[1]!;
      const wa = w[2]! + w[3]!;
      const base = [0, 0, 0];
      const mix = (c: number[], k: number) => {
        for (let q = 0; q < 3; q++) base[q]! += c[q]! * k;
      };
      mix(COLORS.myo, wv);
      mix(COLORS.atrial, wa);
      mix(COLORS.aorta, w[4]!);
      mix(COLORS.pa, w[5]!);
      mix(COLORS.vein, w[6]!);
      mix(COLORS.pvein, w[7]!);
      // Grasso epicardico: segue coronarie e vene nei solchi, solco AV e radice dei grandi vasi
      const dc = distToCoronary(x, y, z);
      const fatVessel = smoothstep(3.8, 1.2, dc) * 0.7;
      const fatAV = smoothstep(0.7, 1.0, 4 * wv * wa);
      const fatRoot = smoothstep(0.7, 1.0, 4 * wv * (w[4]! + w[5]!)) * 0.6;
      fat = Math.min(1, Math.max(fatVessel * (wv + wa), fatAV, fatRoot)) * 0.85;
      col = base.map((c, q) => c * (1 - fat) + COLORS.fat[q]! * fat);
      kind = w[4]! + w[5]! + w[6]! + w[7]! > 0.5 ? 2 : wa > wv ? 1 : 0;
    }
    const o = vOff + i;
    out.position.set(toScene(x, y, z), o * 3);
    out.normal.set([nrm[0]!, nrm[2]!, -nrm[1]!], o * 3);
    out.color.set(col, o * 3);
    out.aChamber.set([w[0]!, w[1]!, w[2]!, w[3]!], o * 4);
    out.aVessel.set([w[4]!, w[5]!, w[6]!, w[7]!], o * 4);
    out.aAxis.set(toScene(axisP[0]!, axisP[1]!, axisP[2]!), o * 3);
    out.aSurface.set([fat, kind], o * 2);
  }
  for (let t = 0; t < part.indices.length; t++) indexList.push(part.indices[t]! + vOff);
  vOff += n;
}
log(`attributi: ${total} vertici, ${indexList.length / 3} triangoli`);

// ---------------------------------------------------------------- riferimenti per la deformazione
const cavityCentroid = (m: TriMesh) => toScene(...centroid(m));
const lvApex = toScene(...apex);
const mc = toScene(...mitralCenter);
const longAxis = [lvApex[0] - mc[0], lvApex[1] - mc[1], lvApex[2] - mc[2]];
const la0 = Math.hypot(longAxis[0]!, longAxis[1]!, longAxis[2]!);
// Apice del VD: punto della cavità destra più lontano dall'anulus tricuspidale lungo l'asse del VS
let rvApex = toScene(RV_CAVITY.positions[0]!, RV_CAVITY.positions[1]!, RV_CAVITY.positions[2]!);
let rvBest = -Infinity;
for (let i = 0; i < RV_CAVITY.positions.length; i += 3) {
  const p = toScene(RV_CAVITY.positions[i]!, RV_CAVITY.positions[i + 1]!, RV_CAVITY.positions[i + 2]!);
  const s =
    ((p[0] - mc[0]) * longAxis[0]! + (p[1] - mc[1]) * longAxis[1]! + (p[2] - mc[2]) * longAxis[2]!) / la0;
  if (s > rvBest) {
    rvBest = s;
    rvApex = p;
  }
}

const meta = {
  source:
    'BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International',
  vertexCount: total,
  indexCount: indexList.length,
  lvApex,
  rvApex,
  longAxis: longAxis.map((v) => v / la0),
  /** Lunghezza base-apice (cm) usata per la torsione */
  baseApexLength: la0 + 1,
  laCenter: cavityCentroid(load('FJ2425')),
  raCenter: cavityCentroid(load('FJ2424')),
  mitralCenter: mc,
  /** Volumi delle cavità nel modello (mL): riferimento per la deformazione */
  refVolume: {
    lv: (signedVolume(LV_CAVITY) * orient(LV_CAVITY)) / 1000,
    rv: (signedVolume(RV_CAVITY) * orient(RV_CAVITY)) / 1000,
    la: Math.abs(signedVolume(load('FJ2425'))) / 1000,
    ra: Math.abs(signedVolume(load('FJ2424'))) / 1000,
  },
};

// ---------------------------------------------------------------- binario quantizzato
// posizioni/assi: uint16 nel box; normali: int8; colori (sRGB), pesi, grasso: uint8; indici uint16/32
const bmin = [Infinity, Infinity, Infinity];
const bmax = [-Infinity, -Infinity, -Infinity];
for (const arr of [out.position, out.aAxis])
  for (let i = 0; i < arr.length; i += 3)
    for (let k = 0; k < 3; k++) {
      bmin[k] = Math.min(bmin[k]!, arr[i + k]!);
      bmax[k] = Math.max(bmax[k]!, arr[i + k]!);
    }
const q16 = (arr: Float32Array) => {
  const o = new Uint16Array(arr.length);
  for (let i = 0; i < arr.length; i++) {
    const k = i % 3;
    o[i] = Math.round(((arr[i]! - bmin[k]!) / (bmax[k]! - bmin[k]!)) * 65535);
  }
  return o;
};
const toSrgb8 = (c: number) =>
  Math.round(255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055));
const u8 = (arr: Float32Array, f: (v: number, i: number) => number) => {
  const o = new Uint8Array(arr.length);
  for (let i = 0; i < arr.length; i++) o[i] = Math.max(0, Math.min(255, f(arr[i]!, i)));
  return o;
};
const i8 = (arr: Float32Array) => {
  const o = new Int8Array(arr.length);
  for (let i = 0; i < arr.length; i++) o[i] = Math.round(arr[i]! * 127);
  return o;
};
const wide = total > 65535;
const buffers: [string, ArrayBufferView][] = [
  ['position', q16(out.position)],
  ['normal', i8(out.normal)],
  ['color', u8(out.color, toSrgb8)],
  ['aChamber', u8(out.aChamber, (v) => Math.round(v * 255))],
  ['aVessel', u8(out.aVessel, (v) => Math.round(v * 255))],
  ['aAxis', q16(out.aAxis)],
  ['aSurface', u8(out.aSurface, (v, i) => (i % 2 === 0 ? Math.round(v * 255) : v))],
  ['index', wide ? new Uint32Array(indexList) : new Uint16Array(indexList)],
];
const layout: { name: string; offset: number; bytes: number }[] = [];
let size = 0;
for (const [name, b] of buffers) {
  size = Math.ceil(size / 4) * 4;
  layout.push({ name, offset: size, bytes: b.byteLength });
  size += b.byteLength;
}
const bin = new Uint8Array(Math.ceil(size / 4) * 4);
buffers.forEach(([, b], i) =>
  bin.set(new Uint8Array(b.buffer, b.byteOffset, b.byteLength), layout[i]!.offset),
);
Object.assign(meta, { bboxMin: bmin, bboxMax: bmax, wideIndex: wide, layout });
writeFileSync('public/models/heart-bp3d.bin', bin);
writeFileSync('public/models/heart-bp3d.json', JSON.stringify(meta, null, 2));
log(`scritto public/models/heart-bp3d.bin (${(size / 1024 / 1024).toFixed(2)} MB)`);
console.log(meta.refVolume);
