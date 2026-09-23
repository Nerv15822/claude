/**
 * Farmacologia semplificata: concentrazione al sito effettore con cinetica del primo ordine
 * (dCe/dt = (dose − Ce)/τ) e effetti Emax, E = C/(EC50 + C), espressi come moltiplicatori dei
 * determinanti emodinamici. I valori sono scelti per riprodurre direzione e ordine di grandezza
 * delle risposte cliniche, non la farmacocinetica individuale (vedi README, Approssimazioni).
 */
import type { DrugParams } from './params';

export type InfusionDrug = keyof DrugParams;

export interface DrugInfo {
  nome: string;
  unita: string;
  max: number;
  step: number;
  /** Costante di tempo di comparsa dell'effetto (s) */
  tau: number;
  ec50: number;
  meccanismo: string;
}

export const DRUGS: Record<InfusionDrug, DrugInfo> = {
  noradrenaline: {
    nome: 'Noradrenalina',
    unita: 'mcg/kg/min',
    max: 1,
    step: 0.01,
    tau: 45,
    ec50: 0.15,
    meccanismo: 'α1 ≫ β1: vasocostrizione arteriosa e venosa, modesto inotropismo.',
  },
  adrenaline: {
    nome: 'Adrenalina',
    unita: 'mcg/kg/min',
    max: 0.5,
    step: 0.01,
    tau: 40,
    ec50: 0.08,
    meccanismo: 'β1/β2 a basse dosi (inotropo, cronotropo), α1 a dosi elevate.',
  },
  dobutamine: {
    nome: 'Dobutamina',
    unita: 'mcg/kg/min',
    max: 20,
    step: 0.5,
    tau: 90,
    ec50: 5,
    meccanismo: 'β1 (inotropo, cronotropo), lieve vasodilatazione β2.',
  },
  vasopressin: {
    nome: 'Vasopressina',
    unita: 'U/min',
    max: 0.06,
    step: 0.005,
    tau: 60,
    ec50: 0.03,
    meccanismo: 'V1: vasocostrizione sistemica senza effetto inotropo, circolo polmonare relativamente risparmiato.',
  },
  esmolol: {
    nome: 'Esmololo',
    unita: 'mcg/kg/min',
    max: 300,
    step: 10,
    tau: 60,
    ec50: 100,
    meccanismo: 'β1-bloccante a breve durata: riduce FC e contrattilità, attenua la risposta riflessa.',
  },
  nitroglycerin: {
    nome: 'Nitroglicerina',
    unita: 'mcg/kg/min',
    max: 5,
    step: 0.1,
    tau: 45,
    ec50: 1.5,
    meccanismo: 'Venodilatazione (↓ precarico) > dilatazione arteriosa; riduce le resistenze polmonari.',
  },
  milrinone: {
    nome: 'Milrinone',
    unita: 'mcg/kg/min',
    max: 0.75,
    step: 0.025,
    tau: 180,
    ec50: 0.4,
    meccanismo: 'Inibitore PDE3 ("inodilatatore"): inotropismo, lusitropismo, vasodilatazione sistemica e polmonare.',
  },
};

export const DRUG_KEYS = Object.keys(DRUGS) as InfusionDrug[];

/** Moltiplicatori applicati ai parametri effettivi del motore. */
export interface Modifiers {
  hr: number;
  lvEes: number;
  rvEes: number;
  /** Rigidità diastolica (λ) di entrambi i ventricoli: < 1 = lusitropismo */
  lambda: number;
  svr: number;
  pvr: number;
  /** Volume unstressed venoso sistemico: > 1 = venodilatazione (↓ volume stressed) */
  venous: number;
  /** Guadagno del baroriflesso (anestesia, β-blocco) */
  reflexGain: number;
  /** Guadagno cronotropo del riflesso (β-blocco) */
  reflexHR: number;
}

export function neutralModifiers(out: Modifiers): Modifiers {
  out.hr = out.lvEes = out.rvEes = out.lambda = out.svr = out.pvr = out.venous = 1;
  out.reflexGain = out.reflexHR = 1;
  return out;
}

const emax = (c: number, ec50: number) => (c > 0 ? c / (ec50 + c) : 0);

/**
 * Stato farmacologico: concentrazioni al sito effettore delle infusioni e del bolo di propofol
 * (modello a due costanti: distribuzione rapida all'effettore, eliminazione più lenta).
 */
export class DrugState {
  readonly ce: Record<InfusionDrug, number> = {
    noradrenaline: 0,
    adrenaline: 0,
    dobutamine: 0,
    vasopressin: 0,
    esmolol: 0,
    nitroglycerin: 0,
    milrinone: 0,
  };
  /** Propofol: quantità plasmatica e al sito effettore (mg/kg equivalenti) */
  propofolPlasma = 0;
  propofolEffect = 0;

  bolusPropofol(mgPerKg: number): void {
    this.propofolPlasma += mgPerKg;
  }

  update(dt: number, doses: DrugParams): void {
    for (const k of DRUG_KEYS) this.ce[k] += ((doses[k] - this.ce[k]) * dt) / DRUGS[k].tau;
    // Propofol: equilibrio plasma→effettore τ ≈ 45 s, ridistribuzione/eliminazione τ ≈ 300 s
    this.propofolEffect += ((this.propofolPlasma - this.propofolEffect) * dt) / 45;
    this.propofolPlasma -= (this.propofolPlasma * dt) / 300;
  }

  /** Effetti combinati come moltiplicatori (prodotto degli effetti dei singoli farmaci). */
  modifiers(out: Modifiers): Modifiers {
    neutralModifiers(out);
    const c = this.ce;
    const na = emax(c.noradrenaline, DRUGS.noradrenaline.ec50);
    out.svr *= 1 + 1.9 * na;
    out.pvr *= 1 + 0.3 * na;
    out.venous *= 1 - 0.1 * na;
    out.lvEes *= 1 + 0.25 * na;
    out.rvEes *= 1 + 0.2 * na;
    out.hr *= 1 + 0.05 * na;

    const adLow = emax(c.adrenaline, DRUGS.adrenaline.ec50);
    const adHigh = emax(c.adrenaline, 0.25);
    out.lvEes *= 1 + 0.8 * adLow;
    out.rvEes *= 1 + 0.6 * adLow;
    out.hr *= 1 + 0.45 * adLow;
    out.svr *= (1 - 0.12 * adLow) * (1 + 0.9 * adHigh);
    out.venous *= 1 - 0.05 * adLow;
    out.lambda *= 1 - 0.08 * adLow;

    const dob = emax(c.dobutamine, DRUGS.dobutamine.ec50);
    out.lvEes *= 1 + 0.7 * dob;
    out.rvEes *= 1 + 0.6 * dob;
    out.hr *= 1 + 0.3 * dob;
    out.svr *= 1 - 0.15 * dob;
    out.lambda *= 1 - 0.1 * dob;

    const vp = emax(c.vasopressin, DRUGS.vasopressin.ec50);
    out.svr *= 1 + 1.0 * vp;
    out.pvr *= 1 + 0.05 * vp;
    out.venous *= 1 - 0.04 * vp;

    const bb = emax(c.esmolol, DRUGS.esmolol.ec50);
    out.hr *= 1 - 0.35 * bb;
    out.lvEes *= 1 - 0.2 * bb;
    out.rvEes *= 1 - 0.15 * bb;
    out.reflexHR *= 1 - 0.7 * bb;

    const ntg = emax(c.nitroglycerin, DRUGS.nitroglycerin.ec50);
    out.venous *= 1 + 0.12 * ntg;
    out.svr *= 1 - 0.2 * ntg;
    out.pvr *= 1 - 0.25 * ntg;

    const mil = emax(c.milrinone, DRUGS.milrinone.ec50);
    out.lvEes *= 1 + 0.45 * mil;
    out.rvEes *= 1 + 0.45 * mil;
    out.lambda *= 1 - 0.15 * mil;
    out.svr *= 1 - 0.3 * mil;
    out.pvr *= 1 - 0.35 * mil;
    out.hr *= 1 + 0.1 * mil;

    // Propofol 2 mg/kg → effetto ~0.6 sul picco: vasodilatazione, lieve inotropismo negativo,
    // simpaticolisi (riduzione del guadagno baroriflesso)
    const pr = emax(this.propofolEffect, 1.0);
    out.svr *= 1 - 0.5 * pr;
    out.venous *= 1 + 0.1 * pr;
    out.lvEes *= 1 - 0.15 * pr;
    out.rvEes *= 1 - 0.1 * pr;
    out.hr *= 1 - 0.05 * pr;
    out.reflexGain *= 1 - 0.75 * pr;
    return out;
  }
}
