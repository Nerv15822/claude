/**
 * Mappatura stato del motore → parametri di deformazione della mesh (lato CPU, senza allocazioni).
 *
 * La mesh rappresenta la superficie epicardica. Il volume racchiuso dall'epicardio è
 * cavità + miocardio (incomprimibile), quindi il fattore di scala esterno è
 *   S = (V + Vparete) / (Vrif + Vparete)
 * Ventricoli: accorciamento longitudinale (ancorato all'apice → discesa dell'anello AV) e radiale,
 * sAx = S^0.3, sRad = S^0.35 (sAx·sRad² = S). Atri: scala isotropa S^(1/3).
 * Vasi: raggio ∝ 1 + k·(P − Prif) (distensibilità).
 *
 * Le superfici endocardiche (cavità, papillari, particelle) seguono il volume della cavità,
 * S_cav = V/Vrif, con lo stesso accorciamento assiale dell'epicardio (l'anulus resta solidale ai lembi)
 * e il resto in direzione radiale: l'ispessimento sistolico della parete è così visibile nelle sezioni.
 * L'ipertrofia moltiplica il volume di parete (fattore di spessore della morfologia del caso).
 */

/** Volumi di riferimento (mL) a cui è modellata la geometria (circa telediastole). */
export const REF_VOLUME = { lv: 120, rv: 125, la: 55, ra: 50 };
/** Volumi di parete (mL): massa miocardica / densità. */
export const WALL_VOLUME = { lv: 140, rv: 50, la: 25, ra: 22 };
/** Distensibilità visiva dei grandi vasi (frazione di raggio per mmHg) e pressioni di riferimento. */
export const VESSEL = { aoK: 0.0018, aoRef: 95, paK: 0.005, paRef: 15 };
/** Torsione apicale massima del VS (rad) a piena attivazione. */
export const MAX_TWIST = 0.2;
/**
 * Setto: spostamento visivo (cm) per mL di variazione del volume settale rispetto al normale
 * (approssimazione didattica: rende visibile lo shift settale/"D-shape"), limitato a ±1.2 cm.
 */
export const SEPTUM = { gain: 0.12, ref: 4.8, max: 1.2 };

export interface DeformState {
  lvRad: number;
  lvAx: number;
  rvRad: number;
  rvAx: number;
  la: number;
  ra: number;
  ao: number;
  pa: number;
  twist: number;
  /** Cavità: scala radiale di VS/VD, scala isotropa di AS/AD */
  lvRadCav: number;
  rvRadCav: number;
  laCav: number;
  raCav: number;
  /** Spostamento del setto verso il VD (cm, negativo = verso il VS) */
  septum: number;
}

export interface Morphology {
  lvWall: number;
  rvWall: number;
}

export function createDeformState(): DeformState {
  return {
    lvRad: 1,
    lvAx: 1,
    rvRad: 1,
    rvAx: 1,
    la: 1,
    ra: 1,
    ao: 1,
    pa: 1,
    twist: 0,
    lvRadCav: 1,
    rvRadCav: 1,
    laCav: 1,
    raCav: 1,
    septum: 0,
  };
}

const ratio = (v: number, ref: number, wall: number) => Math.max(0.2, (Math.max(v, 0) + wall) / (ref + wall));
const clamp = (x: number, a: number, b: number) => Math.min(Math.max(x, a), b);

export type Volumes = typeof REF_VOLUME;

export function computeDeform(
  out: DeformState,
  vLV: number,
  vRV: number,
  vLA: number,
  vRA: number,
  pAo: number,
  pPA: number,
  eV: number,
  ref: Volumes = REF_VOLUME,
  vSpt = SEPTUM.ref,
  morph: Morphology = { lvWall: 1, rvWall: 1 },
): void {
  // Epicardio: cavità + parete. L'accorciamento assiale dipende dal ciclo; l'ipertrofia (parete più
  // voluminosa a parità di cavità) ispessisce la parete in direzione radiale.
  const wl = WALL_VOLUME.lv;
  const wr = WALL_VOLUME.rv;
  const sl = ratio(vLV, ref.lv, wl);
  const sr = ratio(vRV, ref.rv, wr);
  out.lvAx = Math.pow(sl, 0.3);
  out.rvAx = Math.pow(sr, 0.3);
  out.lvRad =
    Math.pow(sl, 0.35) * Math.sqrt((Math.max(vLV, 0) + wl * morph.lvWall) / (Math.max(vLV, 0) + wl));
  out.rvRad =
    Math.pow(sr, 0.35) * Math.sqrt((Math.max(vRV, 0) + wr * morph.rvWall) / (Math.max(vRV, 0) + wr));
  out.la = Math.cbrt(ratio(vLA, ref.la, WALL_VOLUME.la));
  out.ra = Math.cbrt(ratio(vRA, ref.ra, WALL_VOLUME.ra));
  // Endocardio: stesso accorciamento assiale, il resto della variazione di volume è radiale
  out.lvRadCav = Math.sqrt(clamp(vLV / ref.lv, 0.12, 3) / out.lvAx);
  out.rvRadCav = Math.sqrt(clamp(vRV / ref.rv, 0.12, 3) / out.rvAx);
  out.laCav = Math.cbrt(clamp(vLA / ref.la, 0.15, 4));
  out.raCav = Math.cbrt(clamp(vRA / ref.ra, 0.15, 4));
  out.septum = clamp((vSpt - SEPTUM.ref) * SEPTUM.gain, -SEPTUM.max, SEPTUM.max);
  out.ao = 1 + VESSEL.aoK * (pAo - VESSEL.aoRef);
  out.pa = 1 + VESSEL.paK * (pPA - VESSEL.paRef);
  out.twist = MAX_TWIST * Math.min(Math.max(eV, 0), 1);
}
