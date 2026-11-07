/**
 * Emodinamica — parametri del modello a parametri concentrati, circolazione chiusa.
 *
 * Unità interne: mL, mmHg, s (resistenze mmHg·s/mL, compliance mL/mmHg, aree cm², lunghezze cm).
 * I default rappresentano un adulto sano di 70 kg, supino, a riposo (vedi CLAUDE.md e README).
 *
 * Le equazioni fisiche (elastanza tempo-variante, Windkessel a 3 elementi, orifizio di
 * Bernoulli con inertanza, interdipendenza ventricolare di Smith 2004) sono standard di
 * letteratura. La scomposizione del circolo sistemico in sei distretti con autoregolazione
 * è specifica di Emodinamica (vedi districts.ts).
 */

import { type DistrictParams, defaultDistricts } from './districts';

export type Rhythm = 'sinus' | 'af' | 'avb3';
export type VentilationMode = 'apnea' | 'spontaneous' | 'ppv';

/**
 * Camera a elastanza tempo-variante.
 *   P_transmurale = e(t)·Ees·(V − Vd) + (1 − e(t))·P_passiva(V)
 *   P_passiva(V)  = P0·(exp(λ·(V − V0)) − 1)        (EDPVR esponenziale)
 *
 * L'elastanza diastolica Eed del modello lineare E(t)=Eed+(Ees−Eed)e(t) è qui la pendenza
 * locale della EDPVR, P0·λ·exp(λ(V−V0)); si usa una EDPVR non lineare perché la fedeltà
 * fisiologica del riempimento ha priorità sulla forma lineare (vedi README, Approssimazioni).
 */
export interface ChamberParams {
  /** Elastanza telesistolica Ees (mmHg/mL) */
  ees: number;
  /** Intercetta volumetrica della ESPVR (mL) */
  vd: number;
  /** Scala della EDPVR (mmHg) */
  p0: number;
  /** Rigidità della EDPVR (1/mL) */
  lambda: number;
  /** Volume a pressione passiva nulla (mL) */
  v0: number;
}

export interface ValveParams {
  /** Area efficace in apertura (cm²). Stenosi = area ridotta. */
  area: number;
  /** Area efficace retrograda / EROA (cm²). 0 = valvola continente. */
  regurgitantArea: number;
  /** Lunghezza efficace della colonna inerziale (cm) */
  length: number;
  /** Resistenza viscosa anterograda (mmHg·s/mL) */
  r: number;
}

export interface ShuntParams {
  /** Area del difetto (cm²), 0 = assente */
  area: number;
  length: number;
}

/** Circolo con Windkessel a 3 elementi (Zc, R, C) + compartimento venoso capacitivo. */
export interface CirculationParams {
  /** Impedenza caratteristica Zc (mmHg·s/mL) */
  zc: number;
  /** Resistenza periferica totale R (mmHg·s/mL). Nel sistemico è la somma in parallelo dei distretti. */
  r: number;
  /** Compliance arteriosa Ca (mL/mmHg) */
  ca: number;
  /** Volume unstressed arterioso (mL) */
  va0: number;
  /** Compliance venosa Cv (mL/mmHg) */
  cv: number;
  /** Volume unstressed venoso V0v (mL) — determina MSFP e il volume stressato */
  vv0: number;
  /** Resistenza al ritorno venoso Rvr verso l'atrio (mmHg·s/mL) */
  rv: number;
}

export interface PericardiumParams {
  /** Ppc = p0·(exp((V_cuore + versamento − v0)/vk) − 1) */
  p0: number;
  v0: number;
  vk: number;
  /** Versamento pericardico aggiuntivo (mL) */
  effusion: number;
  /** Frazione delle variazioni pleuriche trasmessa alle camere (1 normale; < 1 = costrizione). */
  pleuralTransmission: number;
}

export interface VentilationParams {
  mode: VentilationMode;
  /** Frequenza respiratoria (atti/min) */
  rr: number;
  /** Rapporto E:I (2 = I:E 1:2) */
  ieRatio: number;
  /** Pressione pleurica di fine espirazione (mmHg) */
  pleuralBaseline: number;
  /** Escursione negativa inspiratoria in respiro spontaneo (mmHg) */
  spontaneousSwing: number;
  /** Volume corrente in VPP (mL) */
  tidalVolume: number;
  /** PEEP (cmH2O) */
  peep: number;
  /** Compliance del sistema respiratorio (mL/cmH2O) */
  compliance: number;
  /** Resistenza delle vie aeree (cmH2O·s/L) */
  resistance: number;
  /** Frazione della pressione alveolare trasmessa allo spazio pleurico (0–1) */
  transmission: number;
  /** Aumento frazionale della PVR per cmH2O di pressione alveolare */
  pvrAlveolarCoef: number;
}

export interface RhythmParams {
  rhythm: Rhythm;
  /** Frequenza sinusale / atriale (bpm) */
  hr: number;
  /** Intervallo PR (s) */
  pr: number;
  /** Frequenza del ritmo di scappamento nel BAV III (bpm) */
  escapeRate: number;
  /** Coefficiente di variazione dell'RR in FA */
  afVariability: number;
}

/** Trasporto di ossigeno e stato metabolico (vedi oxygen.ts). */
export interface OxygenParams {
  /** Consumo di O2 basale (mL/min) */
  vo2: number;
  /** Emoglobina (g/dL) */
  hb: number;
  /** Saturazione arteriosa (0–1) */
  sao2: number;
  /** Frazione di shunt polmonare (0–1) — il resto del sangue si ossigena pienamente */
  shuntFraction: number;
}

export interface Params {
  rhythm: RhythmParams;
  lv: ChamberParams;
  rv: ChamberParams;
  la: ChamberParams;
  ra: ChamberParams;
  /** Setto interventricolare (P_spt = P_vs − P_vd nel modello di Smith) */
  septum: ChamberParams;
  pericardium: PericardiumParams;
  mitral: ValveParams;
  aortic: ValveParams;
  tricuspid: ValveParams;
  pulmonic: ValveParams;
  asd: ShuntParams;
  vsd: ShuntParams;
  pda: ShuntParams;
  systemic: CirculationParams;
  pulmonary: CirculationParams;
  /** Sei letti di resistenza sistemica in parallelo (vedi districts.ts). */
  districts: DistrictParams[];
  ventilation: VentilationParams;
  oxygen: OxygenParams;
  /** Velocità massima di infusione/rimozione di volume (mL/s) */
  infusionRate: number;
  /** Volemia totale target (mL). Le variazioni si infondono/rimuovono gradualmente dal venoso. */
  bloodVolume: number;
}

export function defaultParams(): Params {
  return {
    rhythm: { rhythm: 'sinus', hr: 70, pr: 0.16, escapeRate: 38, afVariability: 0.2 },
    lv: { ees: 3.0, vd: 10, p0: 0.14, lambda: 0.036, v0: 10 },
    rv: { ees: 0.55, vd: 15, p0: 0.45, lambda: 0.024, v0: 15 },
    la: { ees: 0.2, vd: 8, p0: 1.2, lambda: 0.048, v0: 8 },
    ra: { ees: 0.18, vd: 8, p0: 1.0, lambda: 0.045, v0: 8 },
    septum: { ees: 48, vd: 2, p0: 1.1, lambda: 0.435, v0: 2 },
    pericardium: { p0: 0.6, v0: 440, vk: 32, effusion: 0, pleuralTransmission: 1 },
    mitral: { area: 4.5, regurgitantArea: 0, length: 1.5, r: 0.002 },
    aortic: { area: 4.0, regurgitantArea: 0, length: 1.5, r: 0.002 },
    tricuspid: { area: 6.0, regurgitantArea: 0, length: 1.5, r: 0.002 },
    pulmonic: { area: 3.5, regurgitantArea: 0, length: 1.5, r: 0.002 },
    asd: { area: 0, length: 0.5 },
    vsd: { area: 0, length: 0.8 },
    pda: { area: 0, length: 1.0 },
    systemic: { zc: 0.045, r: 0.92, ca: 1.3, va0: 650, cv: 140, vv0: 2300, rv: 0.05 },
    pulmonary: { zc: 0.02, r: 0.065, ca: 5.5, va0: 110, cv: 16, vv0: 200, rv: 0.012 },
    districts: defaultDistricts(),
    ventilation: {
      mode: 'spontaneous',
      rr: 12,
      ieRatio: 2,
      pleuralBaseline: -3,
      spontaneousSwing: 3,
      tidalVolume: 500,
      peep: 5,
      compliance: 50,
      resistance: 10,
      transmission: 0.5,
      pvrAlveolarCoef: 0.015,
    },
    oxygen: { vo2: 250, hb: 13, sao2: 0.98, shuntFraction: 0.03 },
    infusionRate: 25,
    bloodVolume: 5000,
  };
}

/** Deep partial per aggiornamenti incrementali. */
export type ParamsPatch = {
  [K in keyof Params]?: Params[K] extends object ? Partial<Params[K]> : Params[K];
};

export function applyPatch(target: Params, patch: ParamsPatch): void {
  for (const key of Object.keys(patch) as (keyof Params)[]) {
    const value = patch[key];
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      (target as unknown as Record<string, unknown>)[key] = structuredClone(value);
    } else if (typeof value === 'object' && value !== null) {
      Object.assign(target[key] as object, value);
    } else {
      (target as unknown as Record<string, unknown>)[key] = value;
    }
  }
}

export function cloneParams(p: Params): Params {
  return structuredClone(p);
}

function assignChamber(d: ChamberParams, s: ChamberParams): void {
  d.ees = s.ees;
  d.vd = s.vd;
  d.p0 = s.p0;
  d.lambda = s.lambda;
  d.v0 = s.v0;
}
function assignValve(d: ValveParams, s: ValveParams): void {
  d.area = s.area;
  d.regurgitantArea = s.regurgitantArea;
  d.length = s.length;
  d.r = s.r;
}
function assignCirc(d: CirculationParams, s: CirculationParams): void {
  d.zc = s.zc;
  d.r = s.r;
  d.ca = s.ca;
  d.va0 = s.va0;
  d.cv = s.cv;
  d.vv0 = s.vv0;
  d.rv = s.rv;
}

/**
 * Copia tutti i campi di `src` in `dst` MUTANDO gli oggetti annidati di `dst` in place
 * (preserva le identità di `dst.rhythm`, `dst.districts`, ecc.). Usato dal modulatore
 * clinico per ripartire da base a ogni passo prima di applicare i moltiplicatori.
 */
export function assignParams(dst: Params, src: Params): void {
  Object.assign(dst.rhythm, src.rhythm);
  assignChamber(dst.lv, src.lv);
  assignChamber(dst.rv, src.rv);
  assignChamber(dst.la, src.la);
  assignChamber(dst.ra, src.ra);
  assignChamber(dst.septum, src.septum);
  Object.assign(dst.pericardium, src.pericardium);
  assignValve(dst.mitral, src.mitral);
  assignValve(dst.aortic, src.aortic);
  assignValve(dst.tricuspid, src.tricuspid);
  assignValve(dst.pulmonic, src.pulmonic);
  Object.assign(dst.asd, src.asd);
  Object.assign(dst.vsd, src.vsd);
  Object.assign(dst.pda, src.pda);
  assignCirc(dst.systemic, src.systemic);
  assignCirc(dst.pulmonary, src.pulmonary);
  Object.assign(dst.ventilation, src.ventilation);
  Object.assign(dst.oxygen, src.oxygen);
  dst.infusionRate = src.infusionRate;
  dst.bloodVolume = src.bloodVolume;
  if (dst.districts.length !== src.districts.length) {
    dst.districts = structuredClone(src.districts);
  } else {
    for (let i = 0; i < src.districts.length; i++) Object.assign(dst.districts[i]!, src.districts[i]!);
  }
}
