/**
 * Anatomia procedurale del cuore come campo di distanza (SDF), in cm, sistema di riferimento del paziente:
 *   x = sinistra del paziente, y = craniale, z = anteriore.
 * Le camere sono ellissoidi orientati lungo l'asse lungo (base → apice verso sinistra, in basso e in
 * avanti); i grandi vasi sono tubi lungo polilinee/curve di Bézier, sezionati con estremità piatte.
 * Oltre alla distanza globale, `evalRegions` fornisce le distanze per gruppo anatomico, usate per
 * pesare la deformazione guidata dal motore fisiologico e per il colore (grasso nei solchi).
 */
import {
  bezier,
  cross,
  frame,
  norm,
  scale,
  sdEllipsoid,
  sdTube,
  smin,
  add,
  type Ellipsoid,
  type Tube,
  type Vec3,
} from './sdf';

/** Gruppi anatomici (indice nell'array delle distanze). */
export const G = {
  LV: 0,
  RV: 1,
  LA: 2,
  RA: 3,
  AORTA: 4,
  PA: 5,
  SYS_VEINS: 6,
  PULM_VEINS: 7,
} as const;
export const GROUPS = 8;

/** Asse lungo del cuore (base → apice). */
export const LONG_AXIS: Vec3 = norm([0.62, -0.66, 0.42]);
/** Centro della base ventricolare (piano valvolare). */
export const BASE: Vec3 = [-0.2, 0.3, 0.0];
/** Direzione anteriore nel piano dell'asse corto. */
export const SHORT_A: Vec3 = norm([
  0 - 0.42 * LONG_AXIS[0],
  0 - 0.42 * LONG_AXIS[1],
  1 - 0.42 * LONG_AXIS[2],
]);
/** Direzione sinistra-craniale nel piano dell'asse corto. */
export const SHORT_S: Vec3 = scale(cross(LONG_AXIS, SHORT_A), -1);

const at = (h: number, s: number, a: number): Vec3 =>
  add(add(add(BASE, scale(LONG_AXIS, h)), scale(SHORT_S, s)), scale(SHORT_A, a));

const [LU, LS, LA_] = frame(LONG_AXIS, SHORT_S);

export const LV_ELLIPSOID: Ellipsoid = {
  c: at(4.3, 0.75, -0.5),
  ax: LU,
  ay: LS,
  az: LA_,
  r: [5.4, 3.5, 3.4],
};
export const LV_APEX: Vec3 = at(9.6, 0.75, -0.5);
export const RV_ELLIPSOID: Ellipsoid = {
  c: at(3.4, -1.3, 1.45),
  ax: LU,
  ay: LS,
  az: LA_,
  r: [4.5, 2.7, 2.6],
};
export const RV_APEX: Vec3 = at(7.8, -1.0, 1.3);

const axes = (): Pick<Ellipsoid, 'ax' | 'ay' | 'az'> => ({ ax: [1, 0, 0], ay: [0, 1, 0], az: [0, 0, 1] });
export const LA_ELLIPSOID: Ellipsoid = { c: [0.4, 2.3, -3.0], ...axes(), r: [2.5, 1.8, 1.9] };
export const RA_ELLIPSOID: Ellipsoid = { c: [-3.0, 1.2, -0.4], ...axes(), r: [1.9, 2.5, 2.1] };

const tube = (pts: Vec3[], r0: number, r1: number, flatEnd = true): Tube => ({
  pts,
  radii: pts.map((_, i) => r0 + ((r1 - r0) * i) / Math.max(pts.length - 1, 1)),
  flatEnd,
});

// Tratto di efflusso del VD (infundibolo) verso la valvola polmonare
export const PULM_VALVE: Vec3 = [0.9, 2.5, 2.2];
export const AORTIC_VALVE: Vec3 = [-0.4, 1.2, 0.4];
const INFUNDIBULUM = tube([at(2.4, -0.7, 1.9), PULM_VALVE], 1.8, 1.35, false);
const LAA = tube(
  [
    [1.8, 2.8, -1.6],
    [2.5, 2.7, -0.3],
    [2.6, 2.4, 0.4],
  ],
  0.85,
  0.45,
  false,
);
const RAA = tube(
  [
    [-2.6, 2.6, 0.8],
    [-1.6, 3.0, 1.8],
  ],
  1.0,
  0.5,
  false,
);

const ARCH = bezier([-0.8, 6.0, 0.6], [-0.9, 9.2, 0.4], [1.7, 9.9, -2.0], [2.4, 7.4, -3.6], 10);
export const AORTA_TUBE: Tube = {
  pts: [AORTIC_VALVE, [-0.6, 3.5, 0.6], ...ARCH, [2.35, 3.0, -4.5], [2.1, -3.5, -4.8]],
  radii: [1.55, 1.45, ...ARCH.map((_, i) => 1.42 - 0.2 * (i / 10)), 1.2, 1.15],
  flatEnd: true,
};
const AORTIC_ROOT: Ellipsoid = { c: [-0.45, 1.8, 0.45], ...axes(), r: [1.75, 1.2, 1.7] };
const BRACHIOCEPHALIC = tube(
  [
    [-0.6, 9.0, 0.1],
    [-1.2, 10.6, 0.35],
    [-1.6, 11.8, 0.5],
  ],
  0.72,
  0.6,
);
const LEFT_CAROTID = tube(
  [
    [0.5, 9.5, -0.9],
    [0.7, 12.0, -0.6],
  ],
  0.46,
  0.42,
);
const LEFT_SUBCLAVIAN = tube(
  [
    [1.4, 9.4, -1.9],
    [2.1, 10.8, -2.1],
    [2.8, 11.8, -2.3],
  ],
  0.56,
  0.5,
);

const PA_TRUNK = bezier(PULM_VALVE, [1.3, 4.0, 1.4], [1.4, 5.0, 0.4], [1.2, 5.4, -0.4], 6);
export const PA_TUBE: Tube = tube(PA_TRUNK, 1.4, 1.3, false);
const LPA = tube(
  [
    [1.2, 5.4, -0.4],
    [2.8, 5.9, -1.4],
    [4.7, 5.5, -2.6],
  ],
  1.0,
  0.9,
);
const RPA = tube(
  [
    [1.2, 5.4, -0.4],
    [-0.5, 5.3, -1.6],
    [-2.4, 5.0, -2.1],
    [-4.5, 4.8, -2.3],
  ],
  1.0,
  0.9,
);

const SVC = tube(
  [
    [-3.0, 3.0, -0.6],
    [-3.0, 9.2, -0.4],
  ],
  1.05,
  1.0,
);
const IVC = tube(
  [
    [-2.8, -0.6, -1.0],
    [-2.6, -3.8, -1.6],
  ],
  1.25,
  1.2,
);
const PVEINS = [
  tube(
    [
      [1.6, 2.9, -3.8],
      [4.8, 3.7, -4.4],
    ],
    0.66,
    0.6,
  ),
  tube(
    [
      [1.6, 1.5, -3.9],
      [4.8, 0.7, -4.6],
    ],
    0.64,
    0.58,
  ),
  tube(
    [
      [-1.1, 2.9, -3.8],
      [-4.6, 3.7, -4.2],
    ],
    0.66,
    0.6,
  ),
  tube(
    [
      [-1.1, 1.5, -3.9],
      [-4.6, 0.7, -4.4],
    ],
    0.64,
    0.58,
  ),
];

/** Scratch per evitare allocazioni. */
const tmp: Vec3 = [0, 0, 0];
const aoAxis: Vec3 = [0, 0, 0];
const paAxis: Vec3 = [0, 0, 0];
const copy = (dst: Vec3, src: Vec3) => {
  dst[0] = src[0];
  dst[1] = src[1];
  dst[2] = src[2];
};

/**
 * Distanza per gruppo anatomico. Scrive le distanze in `out` (lunghezza GROUPS) e, se richiesto, il
 * punto più vicino sull'asse del vaso dominante in `axisOut`. Ritorna la distanza globale (unione morbida).
 */
export function evalRegions(p: Vec3, out: Float64Array, axisOut?: Vec3): number {
  const lv = sdEllipsoid(p, LV_ELLIPSOID);
  const rv = smin(sdEllipsoid(p, RV_ELLIPSOID), sdTube(p, INFUNDIBULUM), 1.2);
  const la = smin(sdEllipsoid(p, LA_ELLIPSOID), sdTube(p, LAA), 0.6);
  const ra = smin(sdEllipsoid(p, RA_ELLIPSOID), sdTube(p, RAA), 0.6);

  let ao = smin(sdTube(p, AORTA_TUBE, aoAxis), sdEllipsoid(p, AORTIC_ROOT), 0.8);
  ao = smin(ao, sdTube(p, BRACHIOCEPHALIC), 0.5);
  ao = smin(ao, sdTube(p, LEFT_CAROTID), 0.4);
  ao = smin(ao, sdTube(p, LEFT_SUBCLAVIAN), 0.4);

  let pa = sdTube(p, PA_TUBE, paAxis);
  const lpa = sdTube(p, LPA, tmp);
  if (lpa < pa) copy(paAxis, tmp);
  pa = smin(pa, lpa, 0.5);
  const rpa = sdTube(p, RPA, tmp);
  if (rpa < pa) copy(paAxis, tmp);
  pa = smin(pa, rpa, 0.5);

  const sv = Math.min(sdTube(p, SVC), sdTube(p, IVC));
  let pv = Infinity;
  for (let i = 0; i < PVEINS.length; i++) pv = Math.min(pv, sdTube(p, PVEINS[i]!));

  out[G.LV] = lv;
  out[G.RV] = rv;
  out[G.LA] = la;
  out[G.RA] = ra;
  out[G.AORTA] = ao;
  out[G.PA] = pa;
  out[G.SYS_VEINS] = sv;
  out[G.PULM_VEINS] = pv;

  if (axisOut) {
    const useAo = ao <= pa;
    const src = useAo ? aoAxis : paAxis;
    axisOut[0] = src[0];
    axisOut[1] = src[1];
    axisOut[2] = src[2];
  }

  // Composizione: ventricoli fusi tra loro (con solco), atri, poi vasi
  const ventricles = smin(lv, rv, 0.9);
  const atria = smin(la, ra, 1.0);
  let d = smin(ventricles, atria, 1.3);
  d = smin(d, ao, 0.7);
  d = smin(d, pa, 0.6);
  d = smin(d, sv, 0.6);
  d = smin(d, pv, 0.5);
  return d;
}

/** Distanza globale (senza dettagli di regione). */
const scratch = new Float64Array(GROUPS);
export function heartSdf(p: Vec3): number {
  return evalRegions(p, scratch);
}

/** Box che contiene tutta l'anatomia (cm). */
export const BOUNDS = { min: [-7.5, -7.5, -7.5] as Vec3, max: [8, 13.5, 6.5] as Vec3 };
