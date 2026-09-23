/**
 * Primitive SDF (signed distance function) in cm, senza dipendenze da three.js.
 * Convenzione: d < 0 dentro, d > 0 fuori.
 */

export type Vec3 = [number, number, number];

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const len = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
export const norm = (a: Vec3): Vec3 => scale(a, 1 / len(a));
export const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

/** Unione morbida polinomiale (Quilez). */
export function smin(a: number, b: number, k: number): number {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

/**
 * Ellissoide orientato: centro c, assi ortonormali (ax, ay, az) e semiassi r.
 * Distanza approssimata (Quilez), buona vicino alla superficie.
 */
export interface Ellipsoid {
  c: Vec3;
  ax: Vec3;
  ay: Vec3;
  az: Vec3;
  r: Vec3;
}

export function sdEllipsoid(p: Vec3, e: Ellipsoid): number {
  const qx = p[0] - e.c[0];
  const qy = p[1] - e.c[1];
  const qz = p[2] - e.c[2];
  const x = (qx * e.ax[0] + qy * e.ax[1] + qz * e.ax[2]) / e.r[0];
  const y = (qx * e.ay[0] + qy * e.ay[1] + qz * e.ay[2]) / e.r[1];
  const z = (qx * e.az[0] + qy * e.az[1] + qz * e.az[2]) / e.r[2];
  const k0 = Math.sqrt(x * x + y * y + z * z);
  const x2 = x / e.r[0];
  const y2 = y / e.r[1];
  const z2 = z / e.r[2];
  const k1 = Math.sqrt(x2 * x2 + y2 * y2 + z2 * z2);
  if (k1 === 0) return -Math.min(e.r[0], e.r[1], e.r[2]);
  return (k0 * (k0 - 1)) / k1;
}

/** Tubo lungo una polilinea con raggio interpolato; estremità piatte (vaso sezionato) opzionali. */
export interface Tube {
  pts: Vec3[];
  radii: number[];
  /** Estremità finale tagliata piatta (vaso sezionato) */
  flatEnd: boolean;
}

/** Distanza da un tubo e punto più vicino sull'asse (scritto in `closest`). Senza allocazioni. */
export function sdTube(p: Vec3, t: Tube, closest?: Vec3): number {
  let best = Infinity;
  const n = t.pts.length;
  const px = p[0];
  const py = p[1];
  const pz = p[2];
  for (let i = 0; i < n - 1; i++) {
    const a = t.pts[i]!;
    const b = t.pts[i + 1]!;
    const bax = b[0] - a[0];
    const bay = b[1] - a[1];
    const baz = b[2] - a[2];
    const pax = px - a[0];
    const pay = py - a[1];
    const paz = pz - a[2];
    const L2 = bax * bax + bay * bay + baz * baz;
    let h = (pax * bax + pay * bay + paz * baz) / L2;
    const ra = t.radii[i]!;
    const rb = t.radii[i + 1]!;
    let d: number;
    if (i === n - 2 && t.flatEnd && h > 1) {
      // Taglio piatto oltre l'estremità: cilindro chiuso
      const axial = (h - 1) * Math.sqrt(L2);
      const rx = pax - bax * h;
      const ry = pay - bay * h;
      const rz = paz - baz * h;
      const radial = Math.sqrt(rx * rx + ry * ry + rz * rz) - rb;
      const ox = radial > 0 ? radial : 0;
      const oy = axial > 0 ? axial : 0;
      d = Math.min(Math.max(radial, axial), 0) + Math.sqrt(ox * ox + oy * oy);
      h = 1;
    } else {
      h = h < 0 ? 0 : h > 1 ? 1 : h;
      const rx = pax - bax * h;
      const ry = pay - bay * h;
      const rz = paz - baz * h;
      d = Math.sqrt(rx * rx + ry * ry + rz * rz) - (ra + (rb - ra) * h);
    }
    if (d < best) {
      best = d;
      if (closest) {
        closest[0] = a[0] + bax * h;
        closest[1] = a[1] + bay * h;
        closest[2] = a[2] + baz * h;
      }
    }
  }
  return best;
}

/** Campiona una curva di Bézier cubica. */
export function bezier(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, n: number): Vec3[] {
  const out: Vec3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    const w0 = u * u * u;
    const w1 = 3 * u * u * t;
    const w2 = 3 * u * t * t;
    const w3 = t * t * t;
    out.push([
      w0 * p0[0] + w1 * p1[0] + w2 * p2[0] + w3 * p3[0],
      w0 * p0[1] + w1 * p1[1] + w2 * p2[1] + w3 * p3[1],
      w0 * p0[2] + w1 * p1[2] + w2 * p2[2] + w3 * p3[2],
    ]);
  }
  return out;
}

/** Base ortonormale con `u` come primo asse e `hint` per orientare il secondo. */
export function frame(u: Vec3, hint: Vec3): [Vec3, Vec3, Vec3] {
  const a = norm(u);
  const b = norm(sub(hint, scale(a, dot(hint, a))));
  const c = cross(a, b);
  return [a, b, c];
}
