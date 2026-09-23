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
import { Grid, blur, lumenSdf, orientOutward, removeJunctionCaps, shellSdf, solidSdf } from './anatomy/voxel';

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
const AORTA_IDS = ['FJ3413', 'FJ3411', 'FJ1931', 'FJ3417', 'FJ3479', 'FJ3483'];
const PULM_ART_IDS = ['FJ2966', 'FJ2924', 'FJ3019'];
const CAVAE = load('FJ3645', 'FJ3441');
const PULM_VEIN_IDS = ['FJ2925', 'FJ2933', 'FJ2944', 'FJ2950', 'FJ2955', 'FJ3020', 'FJ3040'];
const LA_CAVITY = load('FJ2425');
const RA_CAVITY = load('FJ2424');
const PAPILLARY_LV = load('FJ2418', 'FJ2429');
const PAPILLARY_RV = load('FJ2419', 'FJ2430', 'FJ2437');
/** Lembi valvolari reali: [valvola, file] — 0 mitrale, 1 aortica, 2 tricuspide, 3 polmonare */
const LEAFLETS: [number, string][] = [
  [0, 'FJ2420'],
  [0, 'FJ2432'],
  [1, 'FJ2426'],
  [1, 'FJ2431'],
  [1, 'FJ2435'],
  [2, 'FJ2421'],
  [2, 'FJ2433'],
  [2, 'FJ2436'],
  [3, 'FJ2417'],
  [3, 'FJ2427'],
  [3, 'FJ2434'],
];
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

// Vasi: rimozione dei tappi alle giunzioni tra segmenti (lume continuo)
const vessel = (ids: string[]) =>
  mergeMeshes(
    removeJunctionCaps(
      g,
      ids.map((id) => orientOutward(load(id))),
    ),
  );
const AORTA = vessel(AORTA_IDS);
const PULM_ART = vessel(PULM_ART_IDS);
const PULM_VEINS = vessel(PULM_VEIN_IDS);
log('giunzioni vascolari aperte');
const lvCav = solidSdf(g, LV_CAVITY, 22, 4, orient(LV_CAVITY));
const rvCav = solidSdf(g, RV_CAVITY, 22, 4, orient(RV_CAVITY));
log('cavità ventricolari');
// Gli osti venosi (12–15 mm) richiedono una chiusura morfologica ampia per sigillare le cavità atriali
const laCav = solidSdf(g, LA_CAVITY, 22, 8, orient(LA_CAVITY));
const raCav = solidSdf(g, RA_CAVITY, 22, 9, orient(RA_CAVITY));
const la = solidSdf(g, LA_WALL, 6, 3, orient(LA_WALL));
const ra = solidSdf(g, RA_WALL, 6, 3, orient(RA_WALL));
log('atri');
// Banda ampia: la distanza dalla parete al centro del lume serve come raggio dei percorsi del flusso
const ao = shellSdf(g, AORTA, 1.1, 18);
const pa = shellSdf(g, PULM_ART, 1.0, 16);
const cav = shellSdf(g, CAVAE, 0.9, 14);
const pv = shellSdf(g, PULM_VEINS, 0.8, 10);
// Campi con segno del lume (negativi dentro) per le linee centrali e i raggi dei percorsi del flusso
const aoLumen = lumenSdf(g, AORTA, 18);
const paLumen = lumenSdf(g, PULM_ART, 16);
const cavLumen = lumenSdf(g, orientOutward(CAVAE), 14);
const pvLumen = lumenSdf(g, PULM_VEINS, 10);
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

// Superfici endocardiche chiuse (per le sezioni e la vista a raggi X)
const cavitySurface = (f: Float32Array, ratio: number) => {
  const sm = blur(g, f, 1);
  const n = surfaceNets((x, y, z) => g.sample(sm, x, y, z), {
    min: [g.origin[0], g.origin[1], g.origin[2]],
    max: [g.origin[0] + g.size[0], g.origin[1] + g.size[1], g.origin[2] + g.size[2]],
    cell: 1,
  });
  return { ...largestComponents(simplify(n.positions, n.indices, ratio, 0.006), 0.05), field: sm };
};
const cavities = [lvCav, rvCav, laCav, raCav].map((f) => cavitySurface(f, 0.12));
log(`cavità: ${cavities.map((c) => c.positions.length / 3).join(', ')} vertici`);
const papLV = simplify(toF32(PAPILLARY_LV).positions, PAPILLARY_LV.indices, 0.4, 0.01);
const papRV = simplify(toF32(PAPILLARY_RV).positions, PAPILLARY_RV.indices, 0.4, 0.01);
const leafletMeshes = LEAFLETS.map(([, id]) => {
  const m = load(id);
  return simplify(toF32(m).positions, m.indices, 0.3, 0.004);
});
log(`lembi valvolari: ${leafletMeshes.map((l) => l.positions.length / 3).join(', ')} vertici`);

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
  endo: srgb(0xa3362f),
  papillary: srgb(0x8c2722),
  valve: srgb(0xe6d2b5),
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

// ---------------------------------------------------------------- cerniere dei lembi valvolari
const sub3 = (a: number[], b: number[]) => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];
const dot3 = (a: number[], b: number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
const cross3 = (a: number[], b: number[]) => [
  a[1]! * b[2]! - a[2]! * b[1]!,
  a[2]! * b[0]! - a[0]! * b[2]!,
  a[0]! * b[1]! - a[1]! * b[0]!,
];
const norm3 = (a: number[]) => {
  const l = Math.hypot(a[0]!, a[1]!, a[2]!) || 1;
  return [a[0]! / l, a[1]! / l, a[2]! / l];
};
const meshCentroid = (pos: Float32Array | Float64Array) => {
  const c = [0, 0, 0];
  const n = pos.length / 3;
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) c[k] = c[k]! + pos[i * 3 + k]! / n;
  return c;
};
const topCentroid = (m: TriMesh, axisK: number, sign: 1 | -1, frac = 0.12) => {
  const n = m.positions.length / 3;
  const vals = Array.from({ length: n }, (_, i) => sign * m.positions[i * 3 + axisK]!).sort((a, b) => b - a);
  const thr = vals[Math.floor(n * frac)]!;
  const sel: number[] = [];
  for (let i = 0; i < n; i++)
    if (sign * m.positions[i * 3 + axisK]! >= thr)
      sel.push(m.positions[i * 3]!, m.positions[i * 3 + 1]!, m.positions[i * 3 + 2]!);
  return meshCentroid(new Float64Array(sel));
};
const laC = meshCentroid(LA_CAVITY.positions);
const raC = meshCentroid(RA_CAVITY.positions);
let rvApexMm = [0, 0, 0];
{
  let best = -Infinity;
  for (let i = 0; i < RV_CAVITY.positions.length; i += 3) {
    const p = [RV_CAVITY.positions[i]!, RV_CAVITY.positions[i + 1]!, RV_CAVITY.positions[i + 2]!];
    const sc = dot3(sub3(p, mitralCenter), axis);
    if (sc > best) {
      best = sc;
      rvApexMm = p;
    }
  }
}
const valveCenters = [0, 1, 2, 3].map((v) =>
  meshCentroid(mergeMeshes(LEAFLETS.filter(([vv]) => vv === v).map(([, id]) => load(id))).positions),
);
const ascTop = topCentroid(load('FJ3413'), 2, 1);
const ptTop = topCentroid(load('FJ2966'), 2, 1);
/** Direzione del flusso anterogrado attraverso ciascuna valvola */
const valveAxes = [
  norm3(sub3(apex, laC)),
  norm3(sub3(ascTop, valveCenters[1]!)),
  norm3(sub3(rvApexMm, raC)),
  norm3(sub3(ptTop, valveCenters[3]!)),
];
interface Hinge {
  valve: number;
  point: number[];
  axis: number[];
  length: number;
  /** Elevazione del lembo rispetto al piano dell'anulus nella posa del modello (rad, + verso valle) */
  restElevation: number;
}
const hinges: Hinge[] = LEAFLETS.map(([v], i) => {
  const m = leafletMeshes[i]!;
  const C = valveCenters[v]!;
  const nAx = valveAxes[v]!;
  const n = m.positions.length / 3;
  const radial: number[] = [];
  for (let k = 0; k < n; k++) {
    const q = sub3([m.positions[k * 3]!, m.positions[k * 3 + 1]!, m.positions[k * 3 + 2]!], C);
    const a = dot3(q, nAx);
    radial.push(Math.hypot(q[0]! - a * nAx[0]!, q[1]! - a * nAx[1]!, q[2]! - a * nAx[2]!));
  }
  const rmax = Math.max(...radial);
  const atrioventricular = v === 0 || v === 2;
  const axial: number[] = [];
  for (let k = 0; k < n; k++)
    axial.push(dot3(sub3([m.positions[k * 3]!, m.positions[k * 3 + 1]!, m.positions[k * 3 + 2]!], C), nAx));
  const amin = Math.min(...axial);
  const base: number[] = [];
  for (let k = 0; k < n; k++) {
    // AV: l'anulus è la parte più a monte (i lembi includono le corde tendinee verso i papillari);
    // semilunari: l'inserzione sulla parete è la parte più periferica
    const onHinge = atrioventricular ? axial[k]! < amin + 4 : radial[k]! > 0.8 * rmax;
    if (onHinge) base.push(m.positions[k * 3]!, m.positions[k * 3 + 1]!, m.positions[k * 3 + 2]!);
  }
  const H = meshCentroid(new Float64Array(base));
  const hc = sub3(H, C);
  const d = norm3(
    sub3(
      hc,
      nAx.map((x) => x * dot3(hc, nAx)),
    ),
  );
  let ax = norm3(cross3(nAx, d));
  // Verso di rotazione: aprire = portare il margine libero a valle (+n) e verso la parete (+d)
  const tip = sub3(meshCentroid(m.positions), H);
  if (dot3(cross3(ax, tip), nAx) < 0) ax = ax.map((x) => -x);
  let len = 0;
  for (let k = 0; k < n; k++) {
    const q = sub3([m.positions[k * 3]!, m.positions[k * 3 + 1]!, m.positions[k * 3 + 2]!], H);
    const along = dot3(q, ax);
    len = Math.max(len, Math.hypot(q[0]! - along * ax[0]!, q[1]! - along * ax[1]!, q[2]! - along * ax[2]!));
  }
  // Elevazione della posa: direzione cerniera → margine libero rispetto al piano dell'anulus
  const tipPts: number[] = [];
  for (let k = 0; k < n; k++) {
    const q = sub3([m.positions[k * 3]!, m.positions[k * 3 + 1]!, m.positions[k * 3 + 2]!], H);
    const along = dot3(q, ax);
    const r = Math.hypot(q[0]! - along * ax[0]!, q[1]! - along * ax[1]!, q[2]! - along * ax[2]!);
    const inFreeEdge = atrioventricular ? r > 0.35 * len && r < 0.6 * len : r > 0.7 * len;
    if (inFreeEdge) tipPts.push(m.positions[k * 3]!, m.positions[k * 3 + 1]!, m.positions[k * 3 + 2]!);
  }
  const tipDir = norm3(sub3(meshCentroid(new Float64Array(tipPts)), H));
  const restElevation = Math.asin(Math.max(-1, Math.min(1, dot3(tipDir, nAx))));
  return { valve: v, point: H, axis: ax, length: len, restElevation };
});
/** Distanza normalizzata dalla linea di cerniera (0 = anulus, 1 = margine libero). */
function leafT(leaf: number, x: number, y: number, z: number): number {
  const h = hinges[leaf]!;
  const q = sub3([x, y, z], h.point);
  const along = dot3(q, h.axis);
  const r = Math.hypot(q[0]! - along * h.axis[0]!, q[1]! - along * h.axis[1]!, q[2]! - along * h.axis[2]!);
  const d = Math.min(r / h.length, 1);
  // AV: massima rotazione al margine libero, nulla all'anulus e all'apice delle corde (ancorate ai papillari)
  return h.valve === 0 || h.valve === 2 ? Math.sin(Math.PI * Math.min(d / 0.95, 1)) : d;
}

interface Part {
  positions: Float32Array;
  indices: Uint32Array;
  kind: 'heart' | 'coronary' | 'vein' | 'cavity' | 'papillary' | 'valve';
  /** Gruppo di rendering */
  group: 'exterior' | 'cavities' | 'papillary' | 'valves';
  /** Codice di superficie (aSurface.y) */
  code?: number;
  /** Campo per le normali (superfici da SDF) */
  field?: Float32Array;
  leaf?: number;
}
const parts: Part[] = [
  { ...heart, kind: 'heart', group: 'exterior', field },
  { ...coronary, kind: 'coronary', group: 'exterior' },
  { ...veins, kind: 'vein', group: 'exterior' },
  ...cavities.map((c, i): Part => ({ ...c, kind: 'cavity', group: 'cavities', code: 5 + i })),
  { ...papLV, kind: 'papillary', group: 'papillary', code: 9 },
  { ...papRV, kind: 'papillary', group: 'papillary', code: 9 },
  ...leafletMeshes.map((l, i): Part => ({
    ...l,
    kind: 'valve',
    group: 'valves',
    code: 10 + LEAFLETS[i]![0],
    leaf: i,
  })),
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
  aLeaf: new Float32Array(total * 2),
};
const indexList: number[] = [];
const groups: Record<string, { start: number; count: number }> = {};

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
  if (!part.field) {
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
    if (part.field) nrm = grad(part.field, x, y, z);
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
    } else if (part.kind === 'cavity') {
      col = COLORS.endo;
      kind = part.code!;
    } else if (part.kind === 'papillary') {
      col = COLORS.papillary;
      kind = 9;
    } else if (part.kind === 'valve') {
      col = COLORS.valve;
      kind = part.code!;
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
    if (part.leaf !== undefined) out.aLeaf.set([part.leaf + 1, leafT(part.leaf, x, y, z)], o * 2);
  }
  const grp = (groups[part.group] ??= { start: indexList.length, count: 0 });
  for (let t = 0; t < part.indices.length; t++) indexList.push(part.indices[t]! + vOff);
  grp.count = indexList.length - grp.start;
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
  ['aLeaf', u8(out.aLeaf, (v, i) => (i % 2 === 0 ? v : Math.round(v * 255)))],
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
Object.assign(meta, {
  bboxMin: bmin,
  bboxMax: bmax,
  wideIndex: wide,
  layout,
  groups,
  valveCenters: valveCenters.map((c) => toScene(c[0]!, c[1]!, c[2]!)),
  valveAxes: valveAxes.map((a) => [a[0]!, a[2]!, -a[1]!]),
  leaflets: hinges.map((h) => ({
    valve: h.valve,
    point: toScene(h.point[0]!, h.point[1]!, h.point[2]!),
    axis: [h.axis[0]!, h.axis[2]!, -h.axis[1]!],
    restElevation: Number(h.restElevation.toFixed(4)),
  })),
  paths: buildPaths(),
});
writeFileSync('public/models/heart-bp3d.bin', bin);
writeFileSync('public/models/heart-bp3d.json', JSON.stringify(meta, null, 2));
log(`scritto public/models/heart-bp3d.bin (${(size / 1024 / 1024).toFixed(2)} MB)`);
console.log(meta.refVolume);

// ---------------------------------------------------------------- percorsi del flusso (particelle)
/**
 * Rete di percorsi lungo i lumi (cave → AD → VD → AP; vene polmonari → AS → VS → aorta e rami).
 * Ogni punto porta: posizione e raggio del lume (cm), i due flussi del motore da interpolare
 * (indici: 0 qVR, 1 qPVin, 2 qTV, 3 qMV, 4 qPV, 5 qAV, 6 qPULM, 7 qSYS), la frazione di interpolazione,
 * la quota di flusso del ramo e i pesi di regione per la deformazione.
 */
function buildPaths() {
  const slice = (m: TriMesh, k: number, lo: number, hi: number) => {
    const sel: number[] = [];
    for (let i = 0; i < m.positions.length; i += 3) {
      const v = m.positions[i + k]!;
      if (v >= lo && v <= hi) sel.push(m.positions[i]!, m.positions[i + 1]!, m.positions[i + 2]!);
    }
    return meshCentroid(new Float64Array(sel));
  };
  const farEnd = (m: TriMesh, from: number[]) => {
    let dmax = 0;
    for (let i = 0; i < m.positions.length; i += 3)
      dmax = Math.max(
        dmax,
        Math.hypot(
          m.positions[i]! - from[0]!,
          m.positions[i + 1]! - from[1]!,
          m.positions[i + 2]! - from[2]!,
        ),
      );
    const sel: number[] = [];
    for (let i = 0; i < m.positions.length; i += 3)
      if (
        Math.hypot(
          m.positions[i]! - from[0]!,
          m.positions[i + 1]! - from[1]!,
          m.positions[i + 2]! - from[2]!,
        ) >
        0.85 * dmax
      )
        sel.push(m.positions[i]!, m.positions[i + 1]!, m.positions[i + 2]!);
    return meshCentroid(new Float64Array(sel));
  };
  const lerp = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i]! - v) * t);
  const add = (a: number[], b: number[], s: number) => a.map((v, i) => v + b[i]! * s);

  // ---- linee centrali dei vasi
  /**
   * Traccia la linea centrale di un vaso seguendo la cresta del campo di distanza dalla parete
   * (massimo locale nel piano ortogonale alla direzione di avanzamento), passo 3 mm.
   */
  const trackField = (
    f: Float32Array,
    from: number[],
    dir: number[],
    length: number,
    stopBelowZ = -Infinity,
  ) => {
    // Distanza dalla parete verso l'interno del lume (negativa fuori)
    const inside = (q: number[]) => -g.sample(f, q[0]!, q[1]!, q[2]!);
    const recenter = (q: number[], a: number[]) => {
      const u = norm3(cross3(a, Math.abs(a[2]!) < 0.9 ? [0, 0, 1] : [1, 0, 0]));
      const v = cross3(a, u);
      let c = q;
      for (let it = 0; it < 30; it++) {
        let best = c;
        let bestV = inside(c);
        for (let k = 0; k < 8; k++) {
          const ang = (k / 8) * Math.PI * 2;
          const cand = [0, 1, 2].map((i) => c[i]! + (u[i]! * Math.cos(ang) + v[i]! * Math.sin(ang)) * 0.8);
          const val = inside(cand);
          if (val > bestV + 1e-3) {
            bestV = val;
            best = cand;
          }
        }
        if (best === c) break;
        c = best;
      }
      return c;
    };
    let a = norm3(dir);
    let p = recenter(from, a);
    const out: number[][] = [p];
    for (let k = 0; k * 3 < length; k++) {
      // Direzione: nel cono di ±60° attorno a quella corrente, quella che resta più al centro del lume
      const u = norm3(cross3(a, Math.abs(a[2]!) < 0.9 ? [0, 0, 1] : [1, 0, 0]));
      const v = cross3(a, u);
      let bestDir = a;
      let bestVal = inside([p[0]! + a[0]! * 4, p[1]! + a[1]! * 4, p[2]! + a[2]! * 4]);
      for (const tilt of [0.35, 0.7, 1.05]) {
        for (let m = 0; m < 12; m++) {
          const ang = (m / 12) * Math.PI * 2;
          const d = norm3(
            [0, 1, 2].map(
              (i) =>
                a[i]! * Math.cos(tilt) + (u[i]! * Math.cos(ang) + v[i]! * Math.sin(ang)) * Math.sin(tilt),
            ),
          );
          const val = inside([p[0]! + d[0]! * 4, p[1]! + d[1]! * 4, p[2]! + d[2]! * 4]) - tilt * 0.8;
          if (val > bestVal) {
            bestVal = val;
            bestDir = d;
          }
        }
      }
      a = bestDir;
      const next = recenter([p[0]! + a[0]! * 3, p[1]! + a[1]! * 3, p[2]! + a[2]! * 3], a);
      const step = sub3(next, p);
      if (Math.hypot(step[0]!, step[1]!, step[2]!) < 0.5 || inside(next) < 0.5) break;
      a = norm3([
        0.5 * a[0]! + 0.5 * norm3(step)[0]!,
        0.5 * a[1]! + 0.5 * norm3(step)[1]!,
        0.5 * a[2]! + 0.5 * norm3(step)[2]!,
      ]);
      p = next;
      out.push(p);
      if (p[2]! < stopBelowZ) break;
      if (
        k > 3 &&
        (p[0]! < CLIP.min[0] + 3 ||
          p[0]! > CLIP.max[0] - 3 ||
          p[2]! < CLIP.min[2] + 3 ||
          p[2]! > CLIP.max[2] - 3)
      )
        break;
    }
    return out;
  };
  const decimate = (pts: number[][], every: number) =>
    pts.filter((_, i) => i % every === 0 || i === pts.length - 1);
  const dist = (a: number[], b: number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
  const closestTo = (pts: number[][], q: number[]) =>
    pts.reduce((best, p) => (dist(p, q) < dist(best, q) ? p : best));
  const sliceTop = (m: TriMesh) => {
    const sel: number[] = [];
    for (let i = 0; i < m.positions.length; i += 3)
      if (
        m.positions[i + 2]! > CLIP.max[2] - 10 &&
        m.positions[i + 2]! < CLIP.max[2] - 4 &&
        m.positions[i]! < CLIP.max[0] - 2
      )
        sel.push(m.positions[i]!, m.positions[i + 1]!, m.positions[i + 2]!);
    return meshCentroid(new Float64Array(sel));
  };

  const tvC = valveCenters[2]!;
  const rvApexIn = lerp(rvApexMm, tvC, 0.18);
  const rvMid = lerp(tvC, rvApexIn, 0.55);
  const pvC = valveCenters[3]!;
  const rvot = add(pvC, valveAxes[3]!, -12);
  const mvC = valveCenters[0]!;
  const lvApexIn = lerp(apex, mitralCenter, 0.18);
  const lvMid = lerp(mvC, lvApexIn, 0.55);
  const avC = valveCenters[1]!;
  const lvot = add(avC, valveAxes[1]!, -12);

  // Cave: dall'estremità sezionata verso l'atrio destro
  const SVC_M = load('FJ3645');
  const IVC_M = load('FJ3441');
  const ivcBase = slice(IVC_M, 2, CLIP.min[2] + 1, CLIP.min[2] + 8);
  const svcLine = trackField(cavLumen, slice(SVC_M, 2, CLIP.max[2] - 40, CLIP.max[2] - 34), [0, 0, -1], 40);
  const ivcLine = trackField(cavLumen, ivcBase, [0, 0, 1], 30);
  // Aorta: dalla valvola lungo ascendente, arco e discendente
  const AO_M = load('FJ3413', 'FJ3411', 'FJ1931');
  // Partenza nel tratto tubulare dell'ascendente (la radice bulbosa rende ambiguo l'asse locale)
  const ascStart = slice(load('FJ3413'), 2, 1258, 1264);
  const aoTracked = [avC, ...trackField(aoLumen, ascStart, [0, 0, 1], 420, CLIP.min[2] + 6)];
  // Discendente (quasi verticale): baricentri di sezioni orizzontali della mesh reale
  const DESC_M = load('FJ1931');
  const ringRadius = new Map<number[], number>();
  const descLine: number[][] = [];
  for (let z = 1292; z >= CLIP.min[2] + 6; z -= 4) {
    const c = slice(DESC_M, 2, z - 1.5, z + 1.5);
    // Raggio della sezione: distanza media dei vertici dell'anello dal baricentro
    let sum = 0;
    let n = 0;
    for (let i = 0; i < DESC_M.positions.length; i += 3)
      if (Math.abs(DESC_M.positions[i + 2]! - z) < 1.5) {
        sum += Math.hypot(DESC_M.positions[i]! - c[0]!, DESC_M.positions[i + 1]! - c[1]!);
        n++;
      }
    ringRadius.set(c, n ? sum / n : 0);
    descLine.push(c);
  }
  // Ascendente + arco fino al punto più vicino all'inizio della discendente, poi la discendente
  let cut = aoTracked.length - 1;
  let bestD = Infinity;
  for (let i = 0; i < aoTracked.length; i++) {
    const d = dist(aoTracked[i]!, descLine[0]!);
    if (d < bestD) {
      bestD = d;
      cut = i;
    } else if (bestD < 20 && d > bestD + 10) break;
  }
  const aoLine = [...aoTracked.slice(0, cut + 1), ...descLine];
  void AO_M;
  const branch = (id: string) => {
    const m = load(id);
    return trackField(aoLumen, sliceTop(m), [0, 0, -1], 40).reverse();
  };
  const bcLine = branch('FJ3417');
  const lccaLine = branch('FJ3483');
  const lsaLine = branch('FJ3479');
  // Arteria polmonare: tronco dalla valvola, poi rami destro e sinistro
  const PT_M = load('FJ2966', 'FJ2924', 'FJ3019');
  const ptLine = trackField(paLumen, add(pvC, valveAxes[3]!, 6), valveAxes[3]!, 36);
  // Rami: tracciati sulla mesh del singolo ramo, dall'estremità sezionata verso la biforcazione
  const LPA_M = load('FJ2924');
  const RPA_M = load('FJ3019');
  const lpaLine = trackField(
    paLumen,
    slice(LPA_M, 0, CLIP.max[0] - 12, CLIP.max[0] - 5),
    [-1, 0, 0],
    110,
  ).reverse();
  const rpaLine = trackField(
    paLumen,
    slice(RPA_M, 0, CLIP.min[0] + 5, CLIP.min[0] + 12),
    [1, 0, 0],
    110,
  ).reverse();
  void PT_M;
  // Vene polmonari: dall'estremità polmonare verso l'atrio sinistro
  const pvLines = [['FJ2925', 'FJ2933'], ['FJ2944', 'FJ2950', 'FJ2955'], ['FJ3020'], ['FJ3040']].map(
    (ids) => {
      const m = load(...ids);
      const far = farEnd(m, laC);
      return trackField(pvLumen, far, sub3(laC, far), 80);
    },
  );
  if (process.env.DEBUG_PATHS) {
    for (const q of aoLine)
      console.log(
        '  ao',
        q.map((x) => x.toFixed(1)).join(','),
        'in',
        (-g.sample(aoLumen, q[0]!, q[1]!, q[2]!)).toFixed(2),
      );
    for (let dz = -20; dz <= 20; dz += 4) {
      const q = [ascStart[0]!, ascStart[1]!, ascStart[2]! + dz];
      const row = [];
      for (let dx = -20; dx <= 20; dx += 4)
        row.push(
          g
            .sample(ao, q[0]! + dx, q[1]!, q[2]!)
            .toFixed(0)
            .padStart(3),
        );
      console.log('  z' + String(dz).padStart(3), row.join(''));
    }
  }
  log(
    `linee centrali: aorta ${aoLine.length}, AP ${ptLine.length}/${lpaLine.length}/${rpaLine.length}, ` +
      `cave ${svcLine.length}/${ivcLine.length}, vene polmonari ${pvLines.map((l) => l.length).join('/')}, ` +
      `rami ${bcLine.length}/${lccaLine.length}/${lsaLine.length}`,
  );
  const archTop = aoLine.reduce((a, b) => (b[2]! > a[2]! ? b : a));

  /** `fields`: campi con segno (negativi dentro) dei lumi attraversati dallo stadio */
  type Stage = { pts: number[][]; q0: number; q1: number; frac: number; fields: Float32Array[] };
  const right = (inlet: number[][], frac: number, branchLine: number[][]): Stage[] => [
    { pts: decimate(inlet, 3), q0: 0, q1: 0, frac, fields: [cavLumen, raCav] },
    { pts: [inlet[inlet.length - 1]!, raC, tvC], q0: 0, q1: 2, frac: 1, fields: [raCav, rvCav, cavLumen] },
    { pts: [tvC, rvMid, rvApexIn, rvot, pvC], q0: 2, q1: 4, frac: 1, fields: [rvCav, raCav, paLumen] },
    { pts: [pvC, ...decimate(ptLine, 3)], q0: 4, q1: 6, frac: 1, fields: [paLumen, rvCav] },
    { pts: decimate(branchLine, 3), q0: 6, q1: 6, frac: 0.5, fields: [paLumen, rvCav] },
  ];
  const left = (vein: number[][], tail: Stage[]): Stage[] => [
    { pts: decimate(vein, 3), q0: 1, q1: 1, frac: 0.25, fields: [pvLumen, laCav] },
    { pts: [vein[vein.length - 1]!, laC, mvC], q0: 1, q1: 3, frac: 1, fields: [laCav, lvCav, pvLumen] },
    { pts: [mvC, lvMid, lvApexIn, lvot, avC], q0: 3, q1: 5, frac: 1, fields: [lvCav, laCav, aoLumen] },
    ...tail,
  ];
  const archIdx = aoLine.indexOf(archTop);
  const toDesc: Stage[] = [
    {
      pts: [avC, ...decimate(aoLine.slice(0, archIdx + 1), 3)],
      q0: 5,
      q1: 7,
      frac: 1,
      fields: [aoLumen, lvCav],
    },
    { pts: decimate(aoLine.slice(archIdx), 3), q0: 7, q1: 7, frac: 0.72, fields: [aoLumen, lvCav] },
  ];
  const toBranch = (line: number[][], frac: number): Stage[] => {
    const origin = closestTo(aoLine, line[0]!);
    const trunk = aoLine.slice(0, aoLine.indexOf(origin) + 1);
    return [
      { pts: [avC, ...decimate(trunk, 3)], q0: 5, q1: 7, frac: 1, fields: [aoLumen, lvCav] },
      { pts: [origin, ...decimate(line, 2)], q0: 7, q1: 7, frac, fields: [aoLumen, lvCav] },
    ];
  };
  const defs: { side: number; stages: Stage[] }[] = [
    { side: 0, stages: right(svcLine, 0.35, lpaLine) },
    { side: 0, stages: right(svcLine, 0.35, rpaLine) },
    { side: 0, stages: right(ivcLine, 0.65, lpaLine) },
    { side: 0, stages: right(ivcLine, 0.65, rpaLine) },
    ...pvLines.map((l) => ({ side: 1, stages: left(l, toDesc) })),
    { side: 1, stages: left(pvLines[2]!, toBranch(bcLine, 0.12)) },
    { side: 1, stages: left(pvLines[0]!, toBranch(lccaLine, 0.08)) },
    { side: 1, stages: left(pvLines[1]!, toBranch(lsaLine, 0.08)) },
  ];

  /** Raggio misurato dalle sezioni ad anello (discendente) se il punto è vicino a una di esse. */
  const nearestRing = (p: number[]) => {
    let r = -Infinity;
    for (const [c, rr] of ringRadius) if (dist(c, p) < 8) r = Math.max(r, rr * 0.9);
    return r;
  };
  // Catmull-Rom attraverso i punti di uno stadio, campionata ogni ~2 mm
  const catmull = (P: number[][], step: number) => {
    const out: number[][] = [];
    for (let i = 0; i < P.length - 1; i++) {
      const p0 = P[Math.max(i - 1, 0)]!;
      const p1 = P[i]!;
      const p2 = P[i + 1]!;
      const p3 = P[Math.min(i + 2, P.length - 1)]!;
      const L = Math.hypot(p2[0]! - p1[0]!, p2[1]! - p1[1]!, p2[2]! - p1[2]!);
      const n = Math.max(2, Math.ceil(L / step));
      for (let k = 0; k < n; k++) {
        const t = k / n;
        const t2 = t * t;
        const t3 = t2 * t;
        out.push(
          [0, 1, 2].map(
            (c) =>
              0.5 *
              (2 * p1[c]! +
                (-p0[c]! + p2[c]!) * t +
                (2 * p0[c]! - 5 * p1[c]! + 4 * p2[c]! - p3[c]!) * t2 +
                (-p0[c]! + 3 * p1[c]! - 3 * p2[c]! + p3[c]!) * t3),
          ),
        );
      }
    }
    out.push(P[P.length - 1]!);
    return out;
  };

  const wts = new Float64Array(GROUPS);
  return defs.map(({ side, stages }) => {
    const data: number[] = [];
    let volume = 0;
    let prev: number[] | null = null;
    for (const st of stages) {
      const pts = catmull(st.pts, 2);
      for (let i = 0; i < pts.length; i++) {
        if (i === 0 && prev) continue; // evita duplicati tra stadi
        const p = pts[i]!;
        const f = pts.length > 1 ? i / (pts.length - 1) : 0;
        let inside = -Infinity;
        for (const f of st.fields) inside = Math.max(inside, -g.sample(f, p[0]!, p[1]!, p[2]!));
        inside = Math.max(inside, nearestRing(p));
        const r = Math.min(Math.max(inside, 1.5), 25);
        let min = Infinity;
        for (let gi = 0; gi < GROUPS; gi++) {
          wts[gi] = g.sample(fields[gi]!, p[0]!, p[1]!, p[2]!);
          min = Math.min(min, wts[gi]!);
        }
        let sum = 0;
        for (let gi = 0; gi < GROUPS; gi++) {
          wts[gi] = Math.exp(-(wts[gi]! - min) / TAU);
          sum += wts[gi]!;
        }
        const sp = toScene(p[0]!, p[1]!, p[2]!);
        data.push(sp[0], sp[1], sp[2], (r * 0.85) / 10, st.q0, st.q1, f, st.frac);
        for (let gi = 0; gi < GROUPS; gi++) data.push(Number((wts[gi]! / sum).toFixed(4)));
        if (prev) {
          const ds = Math.hypot(p[0]! - prev[0]!, p[1]! - prev[1]!, p[2]! - prev[2]!) / 10;
          volume += Math.PI * Math.pow((r * 0.85) / 10, 2) * ds * st.frac;
        }
        prev = p;
      }
    }
    return {
      side,
      stride: 16,
      volume: Number(volume.toFixed(2)),
      data: data.map((v) => Number(v.toFixed(4))),
    };
  });
}
