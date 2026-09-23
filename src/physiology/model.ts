/**
 * Equazioni del modello a parametri concentrati, circolazione chiusa.
 *
 *   vene polm. → AS →(mitrale)→ VS →(aortica)→ [Zc] arterie sist. →(R)→ vene sist. →(Rv)→ AD
 *   AD →(tricuspide)→ VD →(polmonare)→ [Zc] arterie polm. →(R)→ vene polm.
 *   Shunt opzionali: DIA (AS↔AD), DIV (VS↔VD), dotto arterioso (arterie sist.↔polm.)
 *
 * Le pressioni di camera sono assolute: P = P_transmurale + P_pericardica + P_intratoracica.
 * Le funzioni qui sono prive di allocazioni: operano su Float64Array preallocati.
 */
import type { ChamberParams, Params, ShuntParams, ValveParams } from './params';
import { bernoulliCoefficient, inertance } from './units';
import type { VentilationState } from './ventilation';

/** Indici del vettore di stato. */
export const S = {
  V_LA: 0,
  V_LV: 1,
  V_RA: 2,
  V_RV: 3,
  V_SA: 4,
  V_SV: 5,
  V_PA: 6,
  V_PVN: 7,
  Q_MV: 8,
  Q_AV: 9,
  Q_TV: 10,
  Q_PV: 11,
  Q_ASD: 12,
  Q_VSD: 13,
  Q_PDA: 14,
} as const;
export const STATE_SIZE = 15;

/** Indici delle grandezze algebriche (ausiliarie) calcolate a ogni valutazione. */
export const A = {
  P_LA: 0,
  P_LV: 1,
  P_RA: 2,
  P_RV: 3,
  P_SA: 4,
  P_SV: 5,
  P_PA: 6,
  P_PVN: 7,
  P_AO: 8,
  P_PA_PROX: 9,
  P_PERI: 10,
  P_TH: 11,
  V_SPT: 12,
  Q_SYS: 13,
  Q_VR: 14,
  Q_PULM: 15,
  Q_PVN: 16,
  E_V: 17,
  E_A: 18,
  PAW: 19,
  PALV: 20,
} as const;
export const AUX_SIZE = 21;

const EXP_CLAMP = 40;
const safeExp = (x: number): number => Math.exp(x > EXP_CLAMP ? EXP_CLAMP : x);

/** Pressione transmurale di una camera a elastanza tempo-variante. */
export function chamberPressure(c: ChamberParams, v: number, e: number): number {
  return e * c.ees * (v - c.vd) + (1 - e) * c.p0 * (safeExp(c.lambda * (v - c.v0)) - 1);
}

function chamberDerivative(c: ChamberParams, v: number, e: number): number {
  return e * c.ees + (1 - e) * c.p0 * c.lambda * safeExp(c.lambda * (v - c.v0));
}

/** Setto: relazione passiva simmetrica (sinh) per consentire pressioni transsettali negative. */
function septalPressure(c: ChamberParams, v: number, e: number): number {
  const x = c.lambda * (v - c.v0);
  const clamped = x > EXP_CLAMP ? EXP_CLAMP : x < -EXP_CLAMP ? -EXP_CLAMP : x;
  return e * c.ees * (v - c.vd) + (1 - e) * 2 * c.p0 * Math.sinh(clamped);
}

function septalDerivative(c: ChamberParams, v: number, e: number): number {
  const x = c.lambda * (v - c.v0);
  const clamped = x > EXP_CLAMP ? EXP_CLAMP : x < -EXP_CLAMP ? -EXP_CLAMP : x;
  return e * c.ees + (1 - e) * 2 * c.p0 * c.lambda * Math.cosh(clamped);
}

/**
 * Interdipendenza ventricolare (modello parete libera + setto, Smith et al. 2004).
 * Risolve V_spt tale che  P_spt(V_spt) = P_lvf(V_lv − V_spt) − P_rvf(V_rv + V_spt).
 * V_spt > 0: setto che protrude verso il VD.
 */
export function solveSeptum(p: Params, vlv: number, vrv: number, e: number, guess: number): number {
  let vs = guess;
  for (let i = 0; i < 12; i++) {
    const f =
      septalPressure(p.septum, vs, e) -
      chamberPressure(p.lv, vlv - vs, e) +
      chamberPressure(p.rv, vrv + vs, e);
    const df =
      septalDerivative(p.septum, vs, e) +
      chamberDerivative(p.lv, vlv - vs, e) +
      chamberDerivative(p.rv, vrv + vs, e);
    const dv = f / df;
    vs -= dv;
    if (Math.abs(dv) < 1e-7) break;
  }
  return vs;
}

export function pericardialPressure(p: Params, heartVolume: number): number {
  const pc = p.pericardium;
  return pc.p0 * (safeExp((heartVolume + pc.effusion - pc.v0) / pc.vk) - 1);
}

/**
 * Derivata del flusso attraverso una valvola (diodo con inertanza e perdita di Bernoulli):
 *   L·dQ/dt = ΔP − (R + Zc)·Q − B·Q|Q|,  B = ρ/(2A²),  L = ρ·l/A
 * In apertura si usa l'area anterograda, in flusso retrogrado l'area rigurgitante (EROA).
 * Con EROA = 0 il flusso retrogrado è impedito (chiusura gestita anche da `clampValves`).
 */
export function valveFlowDerivative(
  v: ValveParams,
  q: number,
  dp: number,
  zc: number,
  forwardArea = v.area,
): number {
  const forward = q > 0 || (q === 0 && dp > 0);
  const area = forward ? forwardArea : v.regurgitantArea;
  if (area <= 1e-4) return 0;
  const l = inertance(v.length, area);
  const b = bernoulliCoefficient(area);
  return (dp - (v.r + zc) * q - b * q * Math.abs(q)) / l;
}

export function shuntFlowDerivative(s: ShuntParams, q: number, dp: number): number {
  if (s.area <= 1e-4) return q === 0 ? 0 : -q / 0.005;
  const l = inertance(s.length, s.area);
  const b = bernoulliCoefficient(s.area);
  return (dp - 0.002 * q - b * q * Math.abs(q)) / l;
}

/** Contesto per la valutazione del lato destro: attivazioni e ventilazione al tempo t. */
export interface EvalContext {
  eV: number;
  eA: number;
  vent: VentilationState;
  /** Infusione (+) o rimozione (−) di volume nel compartimento venoso sistemico (mL/s) */
  infusion: number;
  /** Stima iniziale per il volume settale (aggiornata dopo ogni valutazione) */
  septumGuess: number;
  /** Volume del pallone del contropulsatore aortico (mL), sposta sangue dal compartimento arterioso */
  balloon: number;
}

/**
 * Area efficace di efflusso del VS con ostruzione dinamica (CMI ostruttiva): il tratto di efflusso si
 * restringe quando il volume ventricolare è piccolo (tardo-sistole, ipovolemia, inotropi, tachicardia).
 */
export function lvotArea(p: Params, vlv: number): number {
  const o = p.lvot.obstruction;
  if (o <= 0) return p.aortic.area;
  const f = Math.min(Math.max((vlv - p.lvot.vLow) / (p.lvot.vHigh - p.lvot.vLow), 0), 1);
  return Math.max(p.aortic.area * (1 - o * (1 - f * f * (3 - 2 * f))), 0.12);
}

/**
 * Calcola le grandezze algebriche (aux) e le derivate dy dello stato y.
 */
export function evaluate(
  p: Params,
  y: Float64Array,
  ctx: EvalContext,
  dy: Float64Array,
  aux: Float64Array,
): void {
  const eV = ctx.eV;
  const eA = ctx.eA;
  const pth = ctx.vent.pth;

  const vla = y[S.V_LA]!;
  const vlv = y[S.V_LV]!;
  const vra = y[S.V_RA]!;
  const vrv = y[S.V_RV]!;

  const ppc = pericardialPressure(p, vla + vlv + vra + vrv);
  const vspt = solveSeptum(p, vlv, vrv, eV, ctx.septumGuess);
  ctx.septumGuess = vspt;

  // Il pericardio trasmette alle camere le variazioni della pressione pleurica (ridotte se costrittivo)
  const base = p.ventilation.pleuralBaseline;
  const extra = ppc + base + (pth - base) * p.pericardium.pleuralTransmission;
  const pla = chamberPressure(p.la, vla, eA) + extra;
  const plv = chamberPressure(p.lv, vlv - vspt, eV) + extra;
  const pra = chamberPressure(p.ra, vra, eA) + extra;
  const prv = chamberPressure(p.rv, vrv + vspt, eV) + extra;

  const sys = p.systemic;
  const pul = p.pulmonary;
  const psa = (y[S.V_SA]! + ctx.balloon - sys.va0) / sys.ca;
  const psv = (y[S.V_SV]! - sys.vv0) / sys.cv;
  const ppa = (y[S.V_PA]! - pul.va0) / pul.ca + pth;
  const ppvn = (y[S.V_PVN]! - pul.vv0) / pul.cv + pth;

  const qmv = y[S.Q_MV]!;
  const qav = y[S.Q_AV]!;
  const qtv = y[S.Q_TV]!;
  const qpv = y[S.Q_PV]!;
  const qasd = y[S.Q_ASD]!;
  const qvsd = y[S.Q_VSD]!;
  const qpda = y[S.Q_PDA]!;

  const qsys = (psa - psv) / sys.r;
  const qvr = (psv - pra) / sys.rv;
  const palvPos = ctx.vent.palv > 0 ? ctx.vent.palv : 0;
  const rp = pul.r * (1 + p.ventilation.pvrAlveolarCoef * palvPos);
  const qpulm = (ppa - ppvn) / rp;
  const qpvn = (ppvn - pla) / pul.rv;

  dy[S.V_LA] = qpvn - qmv - qasd;
  dy[S.V_LV] = qmv - qav - qvsd;
  dy[S.V_SA] = qav - qsys - qpda;
  dy[S.V_SV] = qsys - qvr + ctx.infusion;
  dy[S.V_RA] = qvr - qtv + qasd;
  dy[S.V_RV] = qtv - qpv + qvsd;
  dy[S.V_PA] = qpv - qpulm + qpda;
  dy[S.V_PVN] = qpulm - qpvn;

  dy[S.Q_MV] = valveFlowDerivative(p.mitral, qmv, pla - plv, 0);
  dy[S.Q_AV] = valveFlowDerivative(p.aortic, qav, plv - psa, sys.zc, lvotArea(p, vlv));
  dy[S.Q_TV] = valveFlowDerivative(p.tricuspid, qtv, pra - prv, 0);
  dy[S.Q_PV] = valveFlowDerivative(p.pulmonic, qpv, prv - ppa, pul.zc);
  dy[S.Q_ASD] = shuntFlowDerivative(p.asd, qasd, pla - pra);
  dy[S.Q_VSD] = shuntFlowDerivative(p.vsd, qvsd, plv - prv);
  dy[S.Q_PDA] = shuntFlowDerivative(p.pda, qpda, psa - ppa);

  aux[A.P_LA] = pla;
  aux[A.P_LV] = plv;
  aux[A.P_RA] = pra;
  aux[A.P_RV] = prv;
  aux[A.P_SA] = psa;
  aux[A.P_SV] = psv;
  aux[A.P_PA] = ppa;
  aux[A.P_PVN] = ppvn;
  aux[A.P_AO] = psa + sys.zc * qav;
  aux[A.P_PA_PROX] = ppa + pul.zc * qpv;
  aux[A.P_PERI] = extra;
  aux[A.P_TH] = pth;
  aux[A.V_SPT] = vspt;
  aux[A.Q_SYS] = qsys;
  aux[A.Q_VR] = qvr;
  aux[A.Q_PULM] = qpulm;
  aux[A.Q_PVN] = qpvn;
  aux[A.E_V] = eV;
  aux[A.E_A] = eA;
  aux[A.PAW] = ctx.vent.paw;
  aux[A.PALV] = ctx.vent.palv;
}

/** Chiusura valvolare: impedisce flusso retrogrado attraverso valvole continenti. */
export function clampValves(p: Params, y: Float64Array): void {
  if (p.mitral.regurgitantArea <= 1e-4 && y[S.Q_MV]! < 0) y[S.Q_MV] = 0;
  if (p.aortic.regurgitantArea <= 1e-4 && y[S.Q_AV]! < 0) y[S.Q_AV] = 0;
  if (p.tricuspid.regurgitantArea <= 1e-4 && y[S.Q_TV]! < 0) y[S.Q_TV] = 0;
  if (p.pulmonic.regurgitantArea <= 1e-4 && y[S.Q_PV]! < 0) y[S.Q_PV] = 0;
}
