/**
 * Emodinamica — geometria cardiaca PROCEDURALE (nessun asset esterno, nessun problema di licenza).
 *
 * Forme anatomicamente plausibili generate da funzioni:
 *  - ventricoli: solido a profilo di "cuore" (apice appuntito in basso, corpo bombato, base
 *    all'anello valvolare); il VD ha sezione a D/semiluna che si appoggia al setto;
 *  - atri: corpo arrotondato con auricola;
 *  - vasi: tubi AFFUSOLATI su linee centrali curve, con rami (arco aortico e tronchi sovraortici,
 *    biforcazione del tronco polmonare).
 *
 * Il volume del motore guida la scala della mesh (vedi HeartScene): la mesh resta il modello.
 */
import * as THREE from 'three';

type V3 = [number, number, number];

/** Profilo del raggio del ventricolo lungo l'asse (t: 0 = apice, 1 = base). */
function ventricleProfile(t: number): number {
  // punti di controllo (t, r/rMax): apice appuntito → corpo bombato → base raccordata
  const cp: V3[] = [
    [0.0, 0.0, 0],
    [0.07, 0.3, 0],
    [0.2, 0.62, 0],
    [0.38, 0.85, 0],
    [0.56, 0.98, 0],
    [0.72, 0.95, 0],
    [0.86, 0.75, 0],
    [1.0, 0.36, 0],
  ];
  for (let i = 0; i < cp.length - 1; i++) {
    const a = cp[i]!;
    const b = cp[i + 1]!;
    if (t >= a[0] && t <= b[0]) {
      const u = (t - a[0]) / (b[0] - a[0]);
      const s = u * u * (3 - 2 * u); // smoothstep
      return a[1] + (b[1] - a[1]) * s;
    }
  }
  return 0;
}

export interface VentricleOpts {
  length: number;
  rMax: number;
  /** true = sezione a D/semiluna (ventricolo destro). */
  crescent: boolean;
  /** Angolo (rad) verso cui è rivolta la faccia settale appiattita. */
  septalAngle: number;
  segU?: number;
  segV?: number;
}

/**
 * Ventricolo: apice all'origine (y = 0), base a y = +length. Pronto per essere scalato
 * attorno all'apice (accorciamento assiale ancorato all'apice, discesa dell'anello).
 */
export function ventricleGeometry(opts: VentricleOpts): THREE.BufferGeometry {
  const { length, rMax, crescent, septalAngle } = opts;
  const SU = opts.segU ?? 48;
  const SV = opts.segV ?? 44;

  const positions: number[] = [];
  const indices: number[] = [];

  const crossFactor = (a: number): number => {
    const d = Math.cos(a - septalAngle); // 1 sul lato settale
    if (crescent) {
      // Faccia settale fortemente appiattita/concava → sezione a D.
      // Faccia settale concava (incavo) + "corna" tangenziali → semiluna che avvolge il VS.
      const notch = 1 - 0.8 * Math.max(d, 0);
      const horns = 1 + 0.24 * Math.sin(a - septalAngle) ** 2;
      const latBulge = 1 + 0.12 * Math.max(-d, 0);
      return notch * horns * latBulge;
    }
    // VS: quasi circolare, lieve appiattimento settale.
    return (1 - 0.1 * Math.max(d, 0)) * (1 - 0.04 * Math.cos(2 * (a - septalAngle)));
  };

  for (let iv = 0; iv <= SV; iv++) {
    const v = iv / SV;
    const y = length * v;
    const rr = rMax * ventricleProfile(v);
    for (let iu = 0; iu <= SU; iu++) {
      const a = (iu / SU) * Math.PI * 2;
      const r = rr * crossFactor(a);
      positions.push(r * Math.cos(a), y, r * Math.sin(a));
    }
  }
  const stride = SU + 1;
  for (let iv = 0; iv < SV; iv++) {
    for (let iu = 0; iu < SU; iu++) {
      const i0 = iv * stride + iu;
      const i1 = i0 + 1;
      const i2 = i0 + stride;
      const i3 = i2 + 1;
      indices.push(i0, i2, i1, i1, i2, i3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

/** Atrio: corpo arrotondato con un'auricola (piccola protrusione). */
export function atriumGeometry(radius: number, appendageDir: V3 = [0.6, 0.4, 0.6]): THREE.BufferGeometry {
  const SU = 28;
  const SV = 22;
  const positions: number[] = [];
  const indices: number[] = [];
  const ad = new THREE.Vector3(...appendageDir).normalize();
  for (let iv = 0; iv <= SV; iv++) {
    const phi = (iv / SV) * Math.PI; // 0..π (polo-polo)
    for (let iu = 0; iu <= SU; iu++) {
      const th = (iu / SU) * Math.PI * 2;
      const n = new THREE.Vector3(
        Math.sin(phi) * Math.cos(th),
        Math.cos(phi) * 0.92,
        Math.sin(phi) * Math.sin(th),
      );
      // auricola: bozzo locale nella direzione appendageDir
      const bump = Math.max(0, n.dot(ad));
      const r = radius * (1 + 0.28 * bump ** 3);
      positions.push(n.x * r, n.y * r, n.z * r);
    }
  }
  const stride = SU + 1;
  for (let iv = 0; iv < SV; iv++) {
    for (let iu = 0; iu < SU; iu++) {
      const i0 = iv * stride + iu;
      indices.push(i0, i0 + stride, i0 + 1, i0 + 1, i0 + stride, i0 + stride + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

/** Tubo AFFUSOLATO lungo una linea centrale (raggio variabile), con frame a trasporto parallelo. */
export function taperedTube(
  pts: V3[],
  radiusAt: (t: number) => number,
  segments = 48,
  radial = 14,
): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
  const positions: number[] = [];
  const indices: number[] = [];

  // frame iniziale
  let prevN = new THREE.Vector3();
  const T0 = curve.getTangentAt(0).normalize();
  const up = Math.abs(T0.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  prevN.copy(up).cross(T0).normalize();

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const P = curve.getPointAt(t);
    const T = curve.getTangentAt(t).normalize();
    // trasporto parallelo della normale
    const N = prevN
      .clone()
      .sub(T.clone().multiplyScalar(prevN.dot(T)))
      .normalize();
    if (N.lengthSq() < 1e-6) N.copy(up).cross(T).normalize();
    prevN = N;
    const B = T.clone().cross(N).normalize();
    const r = radiusAt(t);
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const dir = N.clone()
        .multiplyScalar(Math.cos(a))
        .add(B.clone().multiplyScalar(Math.sin(a)));
      positions.push(P.x + dir.x * r, P.y + dir.y * r, P.z + dir.z * r);
    }
  }
  const stride = radial + 1;
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < radial; j++) {
      const i0 = i * stride + j;
      indices.push(i0, i0 + stride, i0 + 1, i0 + 1, i0 + stride, i0 + stride + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

/** Unisce più geometrie (position + index) in una sola, ricalcolando le normali. */
export function mergeGeos(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let vCount = 0;
  const pos: number[] = [];
  const idx: number[] = [];
  for (const g of geos) {
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) pos.push(p.getX(i), p.getY(i), p.getZ(i));
    const index = g.getIndex();
    if (index) for (let i = 0; i < index.count; i++) idx.push(index.getX(i) + vCount);
    vCount += p.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Linee centrali anatomiche dei vasi (riusate anche dalle particelle di flusso). */
export const CENTERLINES = {
  aorta: [
    [0.62, 1.15, 0.35],
    [0.58, 1.95, 0.28],
    [0.42, 2.7, 0.12],
    [-0.02, 3.15, -0.18],
    [-0.62, 3.05, -0.5],
    [-0.78, 2.3, -0.66],
    [-0.75, 1.3, -0.74],
    [-0.72, 0.45, -0.78],
  ] as V3[],
  aortaBranches: [
    [
      [-0.1, 3.08, -0.2],
      [0.02, 3.7, -0.12],
      [0.05, 3.72, -0.06],
    ],
    [
      [-0.34, 3.12, -0.32],
      [-0.33, 3.78, -0.3],
      [-0.32, 3.74, -0.27],
    ],
    [
      [-0.56, 3.08, -0.44],
      [-0.64, 3.74, -0.46],
      [-0.7, 3.7, -0.46],
    ],
  ] as V3[][],
  pulmTrunk: [
    [-0.95, 1.2, 0.55],
    [-1.05, 1.95, 0.4],
    [-1.2, 2.45, 0.18],
  ] as V3[],
  pulmL: [
    [-1.2, 2.45, 0.18],
    [-1.65, 2.5, 0.04],
    [-2.05, 2.46, -0.08],
  ] as V3[],
  pulmR: [
    [-1.2, 2.45, 0.18],
    [-0.75, 2.42, 0.0],
    [-0.35, 2.36, -0.18],
  ] as V3[],
  svc: [
    [-0.4, 2.35, 0.52],
    [-0.52, 1.75, 0.52],
    [-0.66, 1.2, 0.5],
  ] as V3[],
  ivc: [
    [-0.64, -0.2, 0.44],
    [-0.66, 0.4, 0.45],
    [-0.68, 0.95, 0.46],
  ] as V3[],
  pulmVeins: [
    [
      [2.3, 2.2, -0.95],
      [1.8, 1.9, -0.8],
      [1.45, 1.6, -0.62],
    ],
    [
      [2.25, 1.0, -0.98],
      [1.8, 1.2, -0.82],
      [1.45, 1.4, -0.6],
    ],
    [
      [0.6, 2.25, -1.15],
      [1.0, 1.95, -0.9],
      [1.3, 1.65, -0.62],
    ],
    [
      [0.6, 0.9, -1.1],
      [1.0, 1.15, -0.85],
      [1.3, 1.4, -0.6],
    ],
  ] as V3[][],
};

/** Costruisce la geometria (merge) di aorta + tronchi, polmonare + rami, cave, vene polmonari. */
export function buildVessels() {
  const aortaMain = taperedTube(
    CENTERLINES.aorta,
    (t) => 0.5 - 0.22 * t + 0.07 * Math.exp(-((t - 0.02) ** 2) / 0.004),
  );
  const branches = CENTERLINES.aortaBranches.map((b) => taperedTube(b, () => 0.1, 16, 10));
  const aorta = mergeGeos([aortaMain, ...branches]);

  const pulm = mergeGeos([
    taperedTube(CENTERLINES.pulmTrunk, (t) => 0.44 - 0.06 * t, 24),
    taperedTube(CENTERLINES.pulmL, () => 0.27, 28),
    taperedTube(CENTERLINES.pulmR, () => 0.27, 28),
  ]);

  const caval = mergeGeos([
    taperedTube(CENTERLINES.svc, () => 0.28, 20, 12),
    taperedTube(CENTERLINES.ivc, () => 0.3, 20, 12),
  ]);

  const pulmVeins = mergeGeos(CENTERLINES.pulmVeins.map((v) => taperedTube(v, () => 0.18, 14, 10)));

  return { aorta, pulm, caval, pulmVeins };
}
