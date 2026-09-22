/**
 * Mappatura stato del motore → parametri di deformazione della mesh (lato CPU, senza allocazioni).
 *
 * La mesh rappresenta la superficie epicardica. Il volume racchiuso dall'epicardio è
 * cavità + miocardio (incomprimibile), quindi il fattore di scala esterno è
 *   S = (V + Vparete) / (Vrif + Vparete)
 * Ventricoli: accorciamento longitudinale (ancorato all'apice → discesa dell'anello AV) e radiale,
 * sAx = S^0.3, sRad = S^0.35 (sAx·sRad² = S). Atri: scala isotropa S^(1/3).
 * Vasi: raggio ∝ 1 + k·(P − Prif) (distensibilità).
 */

/** Volumi di riferimento (mL) a cui è modellata la geometria (circa telediastole). */
export const REF_VOLUME = { lv: 120, rv: 125, la: 55, ra: 50 };
/** Volumi di parete (mL): massa miocardica / densità. */
export const WALL_VOLUME = { lv: 140, rv: 50, la: 25, ra: 22 };
/** Distensibilità visiva dei grandi vasi (frazione di raggio per mmHg) e pressioni di riferimento. */
export const VESSEL = { aoK: 0.0018, aoRef: 95, paK: 0.005, paRef: 15 };
/** Torsione apicale massima del VS (rad) a piena attivazione. */
export const MAX_TWIST = 0.2;

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
}

export function createDeformState(): DeformState {
  return { lvRad: 1, lvAx: 1, rvRad: 1, rvAx: 1, la: 1, ra: 1, ao: 1, pa: 1, twist: 0 };
}

const ratio = (v: number, ref: number, wall: number) => Math.max(0.2, (Math.max(v, 0) + wall) / (ref + wall));

export function computeDeform(
  out: DeformState,
  vLV: number,
  vRV: number,
  vLA: number,
  vRA: number,
  pAo: number,
  pPA: number,
  eV: number,
): void {
  const sl = ratio(vLV, REF_VOLUME.lv, WALL_VOLUME.lv);
  const sr = ratio(vRV, REF_VOLUME.rv, WALL_VOLUME.rv);
  out.lvAx = Math.pow(sl, 0.3);
  out.lvRad = Math.pow(sl, 0.35);
  out.rvAx = Math.pow(sr, 0.3);
  out.rvRad = Math.pow(sr, 0.35);
  out.la = Math.cbrt(ratio(vLA, REF_VOLUME.la, WALL_VOLUME.la));
  out.ra = Math.cbrt(ratio(vRA, REF_VOLUME.ra, WALL_VOLUME.ra));
  out.ao = 1 + VESSEL.aoK * (pAo - VESSEL.aoRef);
  out.pa = 1 + VESSEL.paK * (pPA - VESSEL.paRef);
  out.twist = MAX_TWIST * Math.min(Math.max(eV, 0), 1);
}
