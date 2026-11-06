/**
 * Emodinamica — baroriflesso arterioso (seno carotideo / arco aortico).
 *
 * La PAM filtrata è confrontata con un setpoint; l'errore guida quattro effettori con
 * costanti di tempo diverse (ritardo): frequenza, tono arteriolare, tono venoso,
 * contrattilità. I preset riproducono condizioni cliniche in cui il guadagno è alterato.
 *
 * Tutti gli effettori sono moltiplicatori dei parametri effettivi; l'end-organo risponde
 * in proporzione alla responsività adrenergica (pH, temperatura, downregulation β).
 */

export type ReflexPreset = 'awake' | 'anesthesia' | 'neuraxial' | 'denervated' | 'betablocked' | 'elderly';

interface PresetGains {
  nome: string;
  hr: number;
  art: number;
  ven: number;
  ino: number;
}

/** Scala dei guadagni per preset (1 = riflesso integro sveglio). */
export const REFLEX_PRESETS: Record<ReflexPreset, PresetGains> = {
  awake: { nome: 'Sveglio', hr: 1.0, art: 1.0, ven: 1.0, ino: 1.0 },
  anesthesia: { nome: 'Anestesia generale', hr: 0.45, art: 0.5, ven: 0.5, ino: 0.5 },
  neuraxial: { nome: 'Blocco neurassiale', hr: 0.8, art: 0.3, ven: 0.3, ino: 0.7 },
  denervated: { nome: 'Denervato (trapianto/lesione midollare)', hr: 0.0, art: 0.05, ven: 0.05, ino: 0.0 },
  betablocked: { nome: 'β-bloccato cronico', hr: 0.3, art: 0.9, ven: 0.9, ino: 0.5 },
  elderly: { nome: 'Anziano', hr: 0.5, art: 0.7, ven: 0.7, ino: 0.6 },
};

// Guadagni base (variazione frazionale dell'effettore per errore frazionale di PAM, preset sveglio).
const G_HR = 2.4;
const G_ART = 2.6;
const G_VEN = 1.3;
const G_INO = 1.2;

// Costanti di tempo degli effettori (s).
const TAU_HR = 2.5;
const TAU_ART = 7;
const TAU_VEN = 18;
const TAU_INO = 8;
// Costante di tempo del filtro barocettivo sulla PAM (s).
const TAU_MAP = 2;

const clampN = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);

export interface ReflexGainScale {
  /** Responsività adrenostatica globale (end-organo). */
  responsiveness: number;
  /** Attenuazione del guadagno cronotropo (β-blocco farmacologico, in aggiunta al preset). */
  hrDrug: number;
}

export class Baroreflex {
  mapFilt: number;
  /** Moltiplicatori degli effettori (1 = nessun intervento). */
  hrMult = 1;
  /** Moltiplicatore di CONDUTTANZA arteriolare (<1 = vasocostrizione). */
  arterialCond = 1;
  /** Moltiplicatore del volume unstressed venoso (<1 = venocostrizione). */
  venousVv0 = 1;
  inoMult = 1;

  constructor(setpoint: number) {
    this.mapFilt = setpoint;
  }

  reset(setpoint: number): void {
    this.mapFilt = setpoint;
    this.hrMult = this.arterialCond = this.venousVv0 = this.inoMult = 1;
  }

  /**
   * Avanza il riflesso di dt secondi.
   * @param map       PAM istantanea (mmHg)
   * @param setpoint  PAM di riferimento (mmHg)
   * @param preset    guadagni del preset
   * @param scale     responsività e attenuazioni farmacologiche
   * @param enabled   se false, gli effettori rilassano verso 1
   */
  update(
    dt: number,
    map: number,
    setpoint: number,
    preset: ReflexPreset,
    scale: ReflexGainScale,
    enabled: boolean,
  ): void {
    this.mapFilt += ((map - this.mapFilt) / TAU_MAP) * dt;
    const g = REFLEX_PRESETS[preset];
    const resp = scale.responsiveness;

    let hrT = 1,
      artT = 1,
      venT = 1,
      inoT = 1;
    if (enabled) {
      const e = clampN((setpoint - this.mapFilt) / setpoint, -0.5, 0.8);
      hrT = clampN(1 + G_HR * g.hr * resp * scale.hrDrug * e, 0.4, 2.5);
      const artResistance = 1 + G_ART * g.art * resp * e;
      artT = clampN(1 / artResistance, 0.4, 2.2);
      venT = clampN(1 - G_VEN * g.ven * resp * e * 0.3, 0.6, 1.25);
      inoT = clampN(1 + G_INO * g.ino * resp * e, 0.6, 2.2);
    }

    this.hrMult += ((hrT - this.hrMult) / TAU_HR) * dt;
    this.arterialCond += ((artT - this.arterialCond) / TAU_ART) * dt;
    this.venousVv0 += ((venT - this.venousVv0) / TAU_VEN) * dt;
    this.inoMult += ((inoT - this.inoMult) / TAU_INO) * dt;
  }
}
