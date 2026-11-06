/**
 * Emodinamica — FARMACOLOGIA a vettori recettoriali.  (file unico delle costanti)
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ONESTÀ EPISTEMICA (vedi spec §9): tutti gli EC50 e i pesi di distretto stanno in
 * QUESTO file, ciascuno annotato con la fonte o con l'indicazione «stimato». Gli EC50
 * recettoriali in vivo nell'uomo sono mal caratterizzati: il modello è QUALITATIVAMENTE
 * corretto e QUANTITATIVAMENTE indicativo. Strumento didattico, non decisionale.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Ogni farmaco è un vettore di affinità sui bersagli di receptors.ts. L'occupazione segue
 * Hill (EC50, n). Le fasce dose-dipendenti (dopamina, adrenalina) EMERGONO da EC50 diversi:
 * nessuna soglia hard-coded. La concentrazione al sito effettore segue una cinetica del
 * primo ordine (onset/offset τ) verso la dose impostata.
 *
 * La mappatura occupazione → parametri usa pesi specifici per bersaglio e per DISTRETTO:
 * l'α1 non è uniforme (cutaneo e splancnico i più sensibili, cerebrale il meno), e ha pesi
 * distinti per il tono venoso e per il circolo polmonare.
 */
import { DISTRICT_COUNT } from './districts';
import { type Receptor, hillOccupancy } from './receptors';
import { clamp, smoothstep } from './units';

export type DrugId =
  | 'noradrenaline'
  | 'adrenaline'
  | 'dopamine'
  | 'dobutamine'
  | 'phenylephrine'
  | 'ephedrine'
  | 'isoprenaline'
  | 'vasopressin'
  | 'terlipressin'
  | 'milrinone'
  | 'enoximone'
  | 'levosimendan'
  | 'methyleneBlue'
  | 'hydrocortisone'
  | 'nitroglycerin'
  | 'nitroprusside'
  | 'clevidipine'
  | 'urapidil'
  | 'esmolol'
  | 'atropine';

interface Action {
  /** EC50 nelle unità di dose del farmaco. */
  ec50: number;
  /** Coefficiente di Hill (default 1). */
  n?: number;
  /** Efficacia massima (default 1; < 1 agonista parziale). */
  eff?: number;
}

export interface DrugSpec {
  id: DrugId;
  nome: string;
  unita: string;
  min: number;
  max: number;
  step: number;
  kind: 'infusion' | 'bolus';
  /** Costante di tempo di comparsa dell'effetto (s). */
  tauOn: number;
  /** Costante di tempo di scomparsa (s). */
  tauOff: number;
  /** Agonismo: aggiunge occupazione·eff al bersaglio. */
  agonism?: Partial<Record<Receptor, Action>>;
  /** Antagonismo: l'occupazione attenua l'attivazione aggregata del bersaglio. */
  block?: Partial<Record<Receptor, Action>>;
  special?:
    | 'ephedrine'
    | 'nitroglycerin'
    | 'nitroprusside'
    | 'levosimendan'
    | 'methyleneBlue'
    | 'hydrocortisone'
    | 'atropine';
  doseClinica: string;
  fonte: string;
  controindicazioni?: string;
  erroriFrequenti?: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Tabella dei farmaci (vettori di affinità). Dosi in unità cliniche.
// ────────────────────────────────────────────────────────────────────────────
export const DRUGS: Record<DrugId, DrugSpec> = {
  noradrenaline: {
    id: 'noradrenaline',
    nome: 'Noradrenalina',
    unita: 'mcg/kg/min',
    min: 0,
    max: 1,
    step: 0.01,
    kind: 'infusion',
    tauOn: 45,
    tauOff: 40,
    // α1 ≫ β1, β2 trascurabile. Espressa come BASE (1 mg base = 2 mg tartrato).
    agonism: { alpha1: { ec50: 0.08, n: 1.3 }, beta1: { ec50: 0.18, n: 1.2, eff: 0.7 } },
    doseClinica: '0.02–1 mcg/kg/min (base)',
    fonte: 'stimato da risposte cliniche (Overgaard 2008); EC50 recettoriali in vivo mal caratterizzati',
    controindicazioni: 'ipovolemia non corretta; stravaso (necrosi).',
    erroriFrequenti: 'confondere base e tartrato (1 mg base = 2 mg tartrato).',
  },
  adrenaline: {
    id: 'adrenaline',
    nome: 'Adrenalina',
    unita: 'mcg/kg/min',
    min: 0,
    max: 0.5,
    step: 0.005,
    kind: 'infusion',
    tauOn: 40,
    tauOff: 35,
    // Fasce dose-dipendenti EMERGENTI: β2 (EC50 basso) → β1 → α1 (EC50 alto).
    agonism: {
      beta2: { ec50: 0.02, n: 1.2 },
      beta1: { ec50: 0.04, n: 1.2 },
      alpha1: { ec50: 0.12, n: 1.4 },
    },
    doseClinica: '0.01–0.5 mcg/kg/min',
    fonte: 'stimato; fasce β→α da EC50 crescenti (nessuna soglia hard-coded)',
    erroriFrequenti: 'a dose bassa può ridurre la diastolica (β2) nonostante CO in aumento.',
  },
  dopamine: {
    id: 'dopamine',
    nome: 'Dopamina',
    unita: 'mcg/kg/min',
    min: 0,
    max: 20,
    step: 0.5,
    kind: 'infusion',
    tauOn: 50,
    tauOff: 40,
    // Fasce EMERGENTI: D1 (dose bassa) → β1 (media) → α1 (alta).
    agonism: {
      D1: { ec50: 2, n: 1.2 },
      D2: { ec50: 2.5, n: 1.2 },
      beta1: { ec50: 6, n: 1.4 },
      alpha1: { ec50: 13, n: 1.6 },
    },
    doseClinica: '2–20 mcg/kg/min',
    fonte: 'stimato; fasce dopaminergica/β/α da EC50 crescenti',
    erroriFrequenti: 'la "dose renale" non protegge il rene; aritmogena.',
  },
  dobutamine: {
    id: 'dobutamine',
    nome: 'Dobutamina',
    unita: 'mcg/kg/min',
    min: 0,
    max: 20,
    step: 0.5,
    kind: 'infusion',
    tauOn: 90,
    tauOff: 90,
    agonism: { beta1: { ec50: 5, n: 1.2 }, beta2: { ec50: 7, n: 1.1, eff: 0.6 } },
    doseClinica: '2–20 mcg/kg/min',
    fonte: 'stimato (Ruffolo 1987)',
    erroriFrequenti: 'può ridurre la pressione per vasodilatazione β2 se ipovolemico.',
  },
  phenylephrine: {
    id: 'phenylephrine',
    nome: 'Fenilefrina',
    unita: 'mcg/kg/min',
    min: 0,
    max: 5,
    step: 0.05,
    kind: 'infusion',
    tauOn: 30,
    tauOff: 25,
    agonism: { alpha1: { ec50: 0.6, n: 1.4 } },
    doseClinica: '0.1–2 mcg/kg/min (o boli 50–100 mcg)',
    fonte: 'stimato; α1 puro',
    erroriFrequenti: 'bradicardia riflessa; riduce la CO nel cuore scompensato dipendente dal postcarico.',
  },
  ephedrine: {
    id: 'ephedrine',
    nome: 'Efedrina',
    unita: 'mg (bolo)',
    min: 0,
    max: 50,
    step: 5,
    kind: 'bolus',
    tauOn: 20,
    tauOff: 300,
    // Azione INDIRETTA: rilascia noradrenalina dal pool (vedi special).
    agonism: { alpha1: { ec50: 6, n: 1 }, beta1: { ec50: 5, n: 1 } },
    special: 'ephedrine',
    doseClinica: 'boli 5–10 mg',
    fonte: 'stimato; simpaticomimetico indiretto',
    erroriFrequenti: 'tachifilassi dopo boli ripetuti; inefficace se deplettato o β-bloccato.',
  },
  isoprenaline: {
    id: 'isoprenaline',
    nome: 'Isoprenalina',
    unita: 'mcg/min',
    min: 0,
    max: 20,
    step: 0.5,
    kind: 'infusion',
    tauOn: 40,
    tauOff: 35,
    agonism: { beta1: { ec50: 1.5, n: 1.2 }, beta2: { ec50: 1.5, n: 1.2 } },
    doseClinica: '0.5–10 mcg/min',
    fonte: 'stimato; β1/β2 puro',
    erroriFrequenti: 'ipotensione da β2; molto aritmogena.',
  },
  vasopressin: {
    id: 'vasopressin',
    nome: 'Vasopressina',
    unita: 'U/min',
    min: 0,
    max: 0.06,
    step: 0.005,
    kind: 'infusion',
    tauOn: 60,
    tauOff: 50,
    agonism: { V1a: { ec50: 0.02, n: 1.3 }, V2: { ec50: 0.01, n: 1 } },
    doseClinica: '0.01–0.04 U/min',
    fonte: 'stimato; V1a vasocostrittore, circolo polmonare risparmiato',
    erroriFrequenti: 'iponatriemia (V2); ischemia distrettuale ad alte dosi.',
  },
  terlipressin: {
    id: 'terlipressin',
    nome: 'Terlipressina',
    unita: 'mg (bolo)',
    min: 0,
    max: 2,
    step: 0.25,
    kind: 'bolus',
    tauOn: 120,
    tauOff: 3600,
    agonism: { V1a: { ec50: 0.5, n: 1.2 }, V2: { ec50: 0.8, n: 1 } },
    doseClinica: 'boli 1–2 mg',
    fonte: 'stimato; profarmaco a lunga durata',
    erroriFrequenti: 'durata molto lunga; ischemia splancnica.',
  },
  milrinone: {
    id: 'milrinone',
    nome: 'Milrinone',
    unita: 'mcg/kg/min',
    min: 0,
    max: 0.75,
    step: 0.025,
    kind: 'infusion',
    tauOn: 180,
    tauOff: 300,
    agonism: { PDE3: { ec50: 0.3, n: 1.2 } },
    doseClinica: '0.125–0.75 mcg/kg/min',
    fonte: 'stimato; inodilatatore PDE3',
    erroriFrequenti: 'ipotensione; accumulo nell’insufficienza renale.',
  },
  enoximone: {
    id: 'enoximone',
    nome: 'Enoximone',
    unita: 'mcg/kg/min',
    min: 0,
    max: 10,
    step: 0.5,
    kind: 'infusion',
    tauOn: 180,
    tauOff: 300,
    agonism: { PDE3: { ec50: 4, n: 1.2 } },
    doseClinica: '2.5–10 mcg/kg/min',
    fonte: 'stimato; inodilatatore PDE3',
  },
  levosimendan: {
    id: 'levosimendan',
    nome: 'Levosimendan',
    unita: 'mcg/kg/min',
    min: 0,
    max: 0.2,
    step: 0.01,
    kind: 'infusion',
    tauOn: 240,
    tauOff: 3600, // metabolita attivo a emivita lunga (OR-1896)
    agonism: {
      caSens: { ec50: 0.08, n: 1.2 },
      kATP: { ec50: 0.1, n: 1.2 },
      PDE3: { ec50: 0.3, n: 1, eff: 0.4 },
    },
    special: 'levosimendan',
    doseClinica: '0.05–0.2 mcg/kg/min (± bolo)',
    fonte: 'stimato; sensibilizzante al calcio + K-ATP',
    erroriFrequenti: 'effetto persiste giorni (metabolita); ipotensione.',
  },
  methyleneBlue: {
    id: 'methyleneBlue',
    nome: 'Blu di metilene',
    unita: 'mg/kg (bolo)',
    min: 0,
    max: 2,
    step: 0.25,
    kind: 'bolus',
    tauOn: 120,
    tauOff: 1800,
    agonism: { sGCi: { ec50: 0.5, n: 1.3 } },
    special: 'methyleneBlue',
    doseClinica: 'bolo 1–2 mg/kg',
    fonte: 'stimato; inibitore della guanilato ciclasi solubile',
    controindicazioni: 'deficit di G6PD; SSRI (sindrome serotoninergica).',
    erroriFrequenti: 'metemoglobinemia; interferenza con la SpO₂.',
  },
  hydrocortisone: {
    id: 'hydrocortisone',
    nome: 'Idrocortisone',
    unita: 'mg (bolo)',
    min: 0,
    max: 200,
    step: 25,
    kind: 'bolus',
    tauOn: 1800,
    tauOff: 21600,
    special: 'hydrocortisone',
    doseClinica: '50 mg ×4/die (shock settico)',
    fonte: 'stimato; effetto permissivo (ripristina la responsività adrenergica)',
    erroriFrequenti: 'nessun effetto emodinamico diretto; agisce solo in sinergia con le amine.',
  },
  nitroglycerin: {
    id: 'nitroglycerin',
    nome: 'Nitroglicerina',
    unita: 'mcg/kg/min',
    min: 0,
    max: 5,
    step: 0.1,
    kind: 'infusion',
    tauOn: 45,
    tauOff: 40,
    agonism: { noDirect: { ec50: 1.2, n: 1.1 } },
    special: 'nitroglycerin',
    doseClinica: '0.2–5 mcg/kg/min',
    fonte: 'stimato; NO via ALDH2, prevalentemente venoso a basse dosi',
    erroriFrequenti: 'tolleranza nitrica; selettività venosa persa alle dosi alte.',
  },
  nitroprusside: {
    id: 'nitroprusside',
    nome: 'Nitroprussiato',
    unita: 'mcg/kg/min',
    min: 0,
    max: 8,
    step: 0.1,
    kind: 'infusion',
    tauOn: 20,
    tauOff: 20,
    agonism: { noDirect: { ec50: 1.0, n: 1.1 } },
    special: 'nitroprusside',
    doseClinica: '0.3–8 mcg/kg/min',
    fonte: 'stimato; donatore di NO diretto, dilatatore BILANCIATO (arterioso + venoso)',
    controindicazioni: 'insufficienza epatica/renale (cianuro/tiocianato).',
    erroriFrequenti: 'NON è un venodilatatore puro: dilata arterie e vene; tossicità da cianuro.',
  },
  clevidipine: {
    id: 'clevidipine',
    nome: 'Clevidipina',
    unita: 'mcg/kg/min',
    min: 0,
    max: 8,
    step: 0.1,
    kind: 'infusion',
    tauOn: 30,
    tauOff: 30,
    agonism: { lCaBlock: { ec50: 1.5, n: 1.2 } },
    doseClinica: '1–21 mg/h (≈ 0.2–4 mcg/kg/min)',
    fonte: 'stimato; calcio-antagonista diidropiridinico arterioso-selettivo',
    erroriFrequenti: 'tachicardia riflessa; emulsione lipidica.',
  },
  urapidil: {
    id: 'urapidil',
    nome: 'Urapidil',
    unita: 'mg (bolo)',
    min: 0,
    max: 50,
    step: 5,
    kind: 'bolus',
    tauOn: 60,
    tauOff: 600,
    block: { alpha1: { ec50: 15, n: 1.1 } },
    doseClinica: 'boli 10–25 mg',
    fonte: 'stimato; α1-antagonista + agonismo 5-HT1A centrale (simpaticolisi lieve)',
    erroriFrequenti: 'poca tachicardia riflessa rispetto ad altri α-bloccanti.',
  },
  esmolol: {
    id: 'esmolol',
    nome: 'Esmololo',
    unita: 'mcg/kg/min',
    min: 0,
    max: 300,
    step: 10,
    kind: 'infusion',
    tauOn: 60,
    tauOff: 60,
    block: { beta1: { ec50: 90, n: 1.2 } },
    doseClinica: '50–300 mcg/kg/min (± bolo)',
    fonte: 'stimato; β1-bloccante a brevissima durata',
    controindicazioni: 'scompenso acuto, blocco AV, broncospasmo.',
    erroriFrequenti: 'può precipitare lo scompenso; attenua la risposta riflessa.',
  },
  atropine: {
    id: 'atropine',
    nome: 'Atropina',
    unita: 'mg (bolo)',
    min: 0,
    max: 3,
    step: 0.25,
    kind: 'bolus',
    tauOn: 30,
    tauOff: 900,
    special: 'atropine',
    doseClinica: 'boli 0.5–1 mg',
    fonte: 'stimato; vagolitico (antimuscarinico)',
    erroriFrequenti: 'dosi < 0.5 mg possono dare bradicardia paradossa.',
  },
};

export const DRUG_IDS = Object.keys(DRUGS) as DrugId[];

// ────────────────────────────────────────────────────────────────────────────
// Pesi della mappatura occupazione → parametri. (ordine dei distretti = DISTRICT_KEYS)
//   [splancnico, renale, muscolare, cutaneo, coronarico, cerebrale]
// ────────────────────────────────────────────────────────────────────────────
/** α1 arteriolare per distretto: cutaneo e splancnico i più sensibili, cerebrale il meno. */
const ALPHA1_DISTRICT = [1.3, 1.0, 0.9, 1.5, 0.35, 0.15];
/** β2 vasodilatazione per distretto (muscolo e cute i più sensibili). */
const BETA2_DISTRICT = [0.5, 0.3, 1.0, 0.7, 0.4, 0.2];
/** D1 vasodilatazione per distretto (renale e splancnico). */
const D1_DISTRICT = [1.0, 1.3, 0.1, 0.1, 0.2, 0.1];
/** V1a vasocostrizione per distretto (risparmia relativamente coronarico e cerebrale). */
const V1A_DISTRICT = [1.1, 1.2, 0.9, 1.0, 0.5, 0.4];
/** Dilatazione da NO/K-ATP/PDE3/Ca-antagonista per distretto (coronarico ben dilatato). */
const DILATOR_DISTRICT = [1.0, 1.0, 1.0, 1.0, 1.1, 0.8];

// Guadagni globali della mappatura (tarati per risposte cliniche plausibili; stimati).
const K_CONSTRICT = 1.9;
const K_DILATE = 1.6;
const K_VENOCON = 0.42;
const K_VENODIL = 0.55;
const K_PULM_CON = 0.9;
const K_PULM_DIL = 1.2;
const K_INO = 1.1;
const K_LUS = 0.45;
const K_HR = 1.25;

/** α1 sul tono venoso (venocostrizione → ↓ volume unstressed). */
const VEN_ALPHA1 = 1.0;
const VEN_V1A = 0.7;
/** α1 sul circolo polmonare (ipertensione polmonare da α1). */
const PULM_ALPHA1 = 0.7;
const PULM_V1A = 0.15; // vasopressina risparmia il circolo polmonare

/** Tono di NO endogeno a riposo (piccolo); aumenta nella vasoplegia (modulatori). */
export const BASELINE_NO = 0.08;

export interface PharmacoContext {
  /** Responsività adrenergica (pH, temperatura, downregulation β): 1 = piena. */
  adrenergicResponsiveness: number;
  /** Tono di NO endogeno aggiuntivo (vasoplegia settica). */
  extraNO: number;
}

export interface DrugSignals {
  alpha1: number;
  beta1: number;
  beta2: number;
  v2: number;
  d1: number;
  noArterial: number;
  noVenous: number;
  sGC: number;
  caSens: number;
  pde3: number;
  kATP: number;
  nePool: number;
  nitrateTolerance: number;
  cyanide: number;
  methemoglobin: number;
  vagolysis: number;
  betaBlock: number;
  alphaBlock: number;
}

export interface DrugEffects {
  hr: number;
  inotropy: number;
  lusitropy: number;
  districtTone: number[];
  venousVv0: number;
  pulmR: number;
  /** Attenuazione del guadagno cronotropo del riflesso (β-blocco). */
  reflexHRgain: number;
  signals: DrugSignals;
}

/** Stato farmacocinetico: concentrazione al sito effettore + stati speciali. */
export class PharmacoState {
  /** Concentrazione all'effettore per farmaco (unità di dose). */
  ce = new Map<DrugId, number>();
  /** Dose impostata (target dell'infusione; per i boli è un livello che poi decade). */
  dose = new Map<DrugId, number>();
  /** Pool di noradrenalina per l'efedrina (1 = pieno). */
  nePool = 1;
  /** Tolleranza nitrica (0 = assente, 1 = massima). */
  nitrateTolerance = 0;
  /** Cianuro cumulativo dal nitroprussiato (unità arbitrarie). */
  cyanide = 0;

  setDose(id: DrugId, dose: number): void {
    this.dose.set(id, Math.max(0, dose));
  }

  getDose(id: DrugId): number {
    return this.dose.get(id) ?? 0;
  }

  getCe(id: DrugId): number {
    return this.ce.get(id) ?? 0;
  }

  /** Avanza la cinetica di dt secondi. */
  step(dt: number): void {
    for (const id of DRUG_IDS) {
      const spec = DRUGS[id];
      const target = this.dose.get(id) ?? 0;
      const ce = this.ce.get(id) ?? 0;
      const tau = target > ce ? spec.tauOn : spec.tauOff;
      const next = ce + ((target - ce) / Math.max(tau, 1)) * dt;
      this.ce.set(id, next < 1e-9 ? 0 : next);
      // I boli decadono: la dose impostata si azzera con τ di offset (si "consuma").
      if (spec.kind === 'bolus' && target > 0) {
        this.dose.set(id, target - (target / Math.max(spec.tauOff, 1)) * dt);
      }
    }
    // Efedrina: il pool di NA si deplete col rilascio (∝ Ce) e si ricarica lentamente.
    // Coefficiente basso: un singolo bolo intacca poco il pool, i boli ripetuti danno tachifilassi.
    const eph = this.ce.get('ephedrine') ?? 0;
    const release = 0.0035 * eph * this.nePool;
    this.nePool = clamp(this.nePool - release * dt + ((1 - this.nePool) / 200) * dt, 0, 1);
    // Tolleranza nitrica: cresce con l'esposizione alla nitroglicerina, regredisce senza.
    const ntg = this.ce.get('nitroglycerin') ?? 0;
    this.nitrateTolerance = clamp(
      this.nitrateTolerance + ((ntg > 0.3 ? 0.9 : 0) - this.nitrateTolerance) * (dt / 3600),
      0,
      0.85,
    );
    // Cianuro: accumulo ∝ dose cumulativa di nitroprussiato.
    const snp = this.ce.get('nitroprusside') ?? 0;
    this.cyanide = clamp(this.cyanide + snp * dt * 0.0004 - this.cyanide * (dt / 7200), 0, 10);
  }

  private act(receptor: Receptor): number {
    let a = 0;
    for (const id of DRUG_IDS) {
      const spec = DRUGS[id];
      const action = spec.agonism?.[receptor];
      if (!action) continue;
      const ce = this.ce.get(id) ?? 0;
      if (ce <= 0) continue;
      let occ = hillOccupancy(ce, action.ec50, action.n ?? 1) * (action.eff ?? 1);
      // Efedrina: il contributo è scalato dal pool di NA (azione indiretta, tachifilassi).
      if (spec.special === 'ephedrine') occ *= this.nePool;
      a += occ;
    }
    return a;
  }

  private blockOcc(receptor: Receptor): number {
    let b = 0;
    for (const id of DRUG_IDS) {
      const action = DRUGS[id].block?.[receptor];
      if (!action) continue;
      const ce = this.ce.get(id) ?? 0;
      if (ce <= 0) continue;
      b = Math.max(b, hillOccupancy(ce, action.ec50, action.n ?? 1) * (action.eff ?? 1));
    }
    return b;
  }

  /** Calcola gli effetti emodinamici correnti (moltiplicatori dei parametri). */
  effects(ctx: PharmacoContext): DrugEffects {
    const resp = ctx.adrenergicResponsiveness;

    // Attivazioni recettoriali grezze.
    const a1raw = this.act('alpha1');
    const betaBlock = this.blockOcc('beta1');
    const alphaBlock = this.blockOcc('alpha1');
    const a1 = a1raw * (1 - alphaBlock) * resp; // α-blocco (urapidil) e responsività
    const b1 = this.act('beta1') * (1 - betaBlock) * resp;
    const b2 = this.act('beta2') * resp;
    const d1 = this.act('D1');
    const v1a = this.act('V1a');
    const v2 = this.act('V2');
    const pde3 = this.act('PDE3');
    const caSens = this.act('caSens');
    const kATP = this.act('kATP');
    const lCa = this.act('lCaBlock');
    const sGC = this.act('sGCi');

    // Donazione di NO: nitroglicerina (prevalentemente venosa a basse dosi) + nitroprussiato (bilanciato).
    const ntgCe = this.ce.get('nitroglycerin') ?? 0;
    const ntgOut =
      hillOccupancy(ntgCe, DRUGS.nitroglycerin.agonism!.noDirect!.ec50, 1.1) * (1 - this.nitrateTolerance);
    const ntgArterialFrac = smoothstep(1.0, 4.0, ntgCe); // selettività venosa persa alle dosi alte
    const snpCe = this.ce.get('nitroprusside') ?? 0;
    const snpOut = hillOccupancy(snpCe, DRUGS.nitroprusside.agonism!.noDirect!.ec50, 1.1);

    const noGate = 1 - sGC; // il blu di metilene (sGCi) blunta ogni effetto NO
    const baselineNO = (BASELINE_NO + ctx.extraNO) * noGate;
    const noVenous = (ntgOut * 1.0 + snpOut * 1.0) * noGate + baselineNO;
    const noArterial = (ntgOut * ntgArterialFrac + snpOut * 1.0) * noGate + baselineNO;

    // Tono dei distretti (moltiplicatore di conduttanza = 1/Rfac).
    const districtTone = new Array<number>(DISTRICT_COUNT);
    for (let i = 0; i < DISTRICT_COUNT; i++) {
      const constrict = ALPHA1_DISTRICT[i]! * a1 + V1A_DISTRICT[i]! * v1a;
      const dilate =
        BETA2_DISTRICT[i]! * b2 +
        D1_DISTRICT[i]! * d1 +
        DILATOR_DISTRICT[i]! * (noArterial + 0.8 * kATP + 0.7 * pde3 + 0.9 * lCa);
      const rfac = (1 + K_CONSTRICT * constrict) / (1 + K_DILATE * dilate);
      districtTone[i] = clamp(1 / rfac, 0.15, 6);
    }

    // Tono venoso (vv0): venocostrizione ↓ unstressed, venodilatazione ↑.
    const venocon = VEN_ALPHA1 * a1 + VEN_V1A * v1a;
    const venodil = noVenous + 0.5 * pde3;
    const venousVv0 = clamp(1 - K_VENOCON * venocon + K_VENODIL * venodil * 0.4, 0.55, 1.5);

    // Circolo polmonare.
    const pulmCon = PULM_ALPHA1 * a1 + PULM_V1A * v1a;
    const pulmDil = noArterial + 0.9 * pde3 + 0.5 * kATP;
    const pulmR = clamp((1 + K_PULM_CON * pulmCon) / (1 + K_PULM_DIL * pulmDil), 0.5, 3);

    // Inotropismo (Ees), lusitropismo (λ), cronotropismo (FC).
    const inoDrive = K_INO * (b1 + 0.9 * caSens + 0.8 * pde3) - 0.5 * lCa;
    const inotropy = clamp(1 + inoDrive, 0.4, 3.5);
    const lusitropy = clamp(1 - K_LUS * (b1 + pde3 + 0.5 * caSens), 0.5, 1.1);

    const vagolysis = this.vagolysisLevel();
    const hrDrive = K_HR * (b1 + 0.15 * b2) - 0.5 * betaBlock + 0.5 * vagolysis;
    const hr = clamp(1 + hrDrive, 0.45, 3);

    const reflexHRgain = clamp(1 - 0.85 * betaBlock, 0.1, 1);

    return {
      hr,
      inotropy,
      lusitropy,
      districtTone,
      venousVv0,
      pulmR,
      reflexHRgain,
      signals: {
        alpha1: a1,
        beta1: b1,
        beta2: b2,
        v2,
        d1,
        noArterial,
        noVenous,
        sGC,
        caSens,
        pde3,
        kATP,
        nePool: this.nePool,
        nitrateTolerance: this.nitrateTolerance,
        cyanide: this.cyanide,
        methemoglobin: this.methemoglobinLevel(),
        vagolysis,
        betaBlock,
        alphaBlock,
      },
    };
  }

  /** Vagolisi da atropina (0…1): alza la FC e abolisce la bradicardia riflessa. */
  private vagolysisLevel(): number {
    const ce = this.ce.get('atropine') ?? 0;
    return hillOccupancy(ce, 0.4, 1.4);
  }

  /** Metemoglobina (frazione) dal blu di metilene ad alte dosi. */
  private methemoglobinLevel(): number {
    const ce = this.ce.get('methyleneBlue') ?? 0;
    return clamp(Math.max(0, ce - 1.0) * 0.08, 0, 0.3);
  }

  /** Frazione del pool di NA (per la scheda/efedrina). */
  get neuronalPool(): number {
    return this.nePool;
  }

  /** Livello permissivo dell'idrocortisone (0…1): ripristina la responsività adrenergica. */
  permissiveLevel(): number {
    const ce = this.ce.get('hydrocortisone') ?? 0;
    return hillOccupancy(ce, 50, 1.2);
  }
}
