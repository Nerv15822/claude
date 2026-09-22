/**
 * Parametri del modello a parametri concentrati.
 * Unità: mL, mmHg, s (resistenze in mmHg·s/mL, compliance in mL/mmHg, aree in cm², lunghezze in cm).
 * I valori di default rappresentano un adulto sano di 70 kg, supino, a riposo (vedi CLAUDE.md).
 */

export type Rhythm = 'sinus' | 'af' | 'avb3';
export type VentilationMode = 'apnea' | 'spontaneous' | 'ppv';

/**
 * Camera a elastanza tempo-variante con relazione diastolica esponenziale:
 * P = e(t)·Ees·(V − Vd) + (1 − e(t))·P0·(exp(λ·(V − V0)) − 1)
 */
export interface ChamberParams {
  /** Elastanza telesistolica (mmHg/mL) */
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
  /** Area efficace retrograda (cm², EROA). 0 = valvola continente. */
  regurgitantArea: number;
  /** Lunghezza efficace della colonna inerziale (cm) */
  length: number;
  /** Resistenza viscosa (mmHg·s/mL) */
  r: number;
}

export interface ShuntParams {
  /** Area del difetto (cm²), 0 = assente */
  area: number;
  length: number;
}

export interface CirculationParams {
  /** Impedenza caratteristica (mmHg·s/mL) */
  zc: number;
  /** Resistenza periferica (mmHg·s/mL) */
  r: number;
  /** Compliance arteriosa (mL/mmHg) */
  ca: number;
  /** Volume unstressed arterioso (mL) */
  va0: number;
  /** Compliance venosa (mL/mmHg) */
  cv: number;
  /** Volume unstressed venoso (mL) */
  vv0: number;
  /** Resistenza venosa verso l'atrio (mmHg·s/mL) */
  rv: number;
}

export interface PericardiumParams {
  /** P = p0·(exp((V − v0)/vk) − 1) */
  p0: number;
  v0: number;
  vk: number;
  /** Versamento pericardico aggiuntivo (mL) */
  effusion: number;
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
  /** Volume corrente in ventilazione a pressione positiva (mL) */
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

export interface OxygenParams {
  /** Consumo di O2 (mL/min) */
  vo2: number;
  /** Emoglobina (g/dL) */
  hb: number;
  /** Saturazione arteriosa (0–1) */
  sao2: number;
}

export interface Params {
  rhythm: RhythmParams;
  lv: ChamberParams;
  rv: ChamberParams;
  la: ChamberParams;
  ra: ChamberParams;
  /** Setto interventricolare (P = Pvs − Pvd) */
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
  ventilation: VentilationParams;
  oxygen: OxygenParams;
  /** Volemia totale target (mL). Le variazioni sono infuse/rimosse gradualmente dal compartimento venoso. */
  bloodVolume: number;
}

export function defaultParams(): Params {
  return {
    rhythm: { rhythm: 'sinus', hr: 70, pr: 0.16, escapeRate: 38, afVariability: 0.2 },
    lv: { ees: 3.3, vd: 10, p0: 0.2, lambda: 0.036, v0: 10 },
    rv: { ees: 0.55, vd: 15, p0: 0.45, lambda: 0.024, v0: 15 },
    la: { ees: 0.2, vd: 8, p0: 1.2, lambda: 0.048, v0: 8 },
    ra: { ees: 0.18, vd: 8, p0: 1.0, lambda: 0.045, v0: 8 },
    septum: { ees: 48, vd: 2, p0: 1.1, lambda: 0.435, v0: 2 },
    pericardium: { p0: 0.6, v0: 440, vk: 32, effusion: 0 },
    mitral: { area: 4.5, regurgitantArea: 0, length: 1.5, r: 0.002 },
    aortic: { area: 4.0, regurgitantArea: 0, length: 1.5, r: 0.002 },
    tricuspid: { area: 6.0, regurgitantArea: 0, length: 1.5, r: 0.002 },
    pulmonic: { area: 3.5, regurgitantArea: 0, length: 1.5, r: 0.002 },
    asd: { area: 0, length: 0.5 },
    vsd: { area: 0, length: 0.8 },
    pda: { area: 0, length: 1.0 },
    systemic: { zc: 0.045, r: 0.97, ca: 1.3, va0: 650, cv: 140, vv0: 2360, rv: 0.04 },
    pulmonary: { zc: 0.02, r: 0.065, ca: 5.5, va0: 110, cv: 16, vv0: 200, rv: 0.012 },
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
    oxygen: { vo2: 250, hb: 13, sao2: 0.98 },
    bloodVolume: 5000,
  };
}

/** Deep partial per aggiornamenti incrementali dei parametri. */
export type ParamsPatch = {
  [K in keyof Params]?: Params[K] extends object ? Partial<Params[K]> : Params[K];
};

/** Applica una patch ai parametri (mutando `target`). */
export function applyPatch(target: Params, patch: ParamsPatch): void {
  for (const key of Object.keys(patch) as (keyof Params)[]) {
    const value = patch[key];
    if (value === undefined) continue;
    if (typeof value === 'object' && value !== null) {
      Object.assign(target[key] as object, value);
    } else {
      (target as unknown as Record<string, unknown>)[key] = value;
    }
  }
}

export function cloneParams(p: Params): Params {
  return structuredClone(p);
}
