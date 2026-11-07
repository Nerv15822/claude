/**
 * Emodinamica — scenari clinici precaricati (spec §8).
 *
 * Ogni scenario è una patch dei parametri base + stato metabolico + preset del riflesso
 * (+ eventuali infusioni iniziali). È TypeScript puro: gli effetti emodinamici EMERGONO
 * dal motore, non sono imposti. Ogni scenario ha una scheda didattica e, nei test, una
 * direzione attesa (tests/app/scenarios.test.ts).
 */
import {
  CardioEngine,
  ClinicalModulator,
  type DrugId,
  type MetabolicState,
  type ParamsPatch,
  type ReflexPreset,
  applyPatch,
  defaultMetabolic,
  defaultParams,
} from '../engine';

export interface Scenario {
  id: string;
  nome: string;
  /** Una frase di inquadramento clinico. */
  sommario: string;
  /** Fisiopatologia e obiettivi (scheda). */
  scheda: string;
  patch: ParamsPatch;
  metabolic?: Partial<MetabolicState>;
  reflex?: { preset: ReflexPreset; enabled?: boolean };
  doses?: Partial<Record<DrugId, number>>;
}

export const SCENARIOS: Scenario[] = [
  {
    id: 'normale',
    nome: 'Normale',
    sommario: 'Adulto sano a riposo, respiro spontaneo.',
    scheda: 'Riferimento. Osserva i valori basali e usa i farmaci per capirne la direzione.',
    patch: {},
  },
  {
    id: 'settico',
    nome: 'Shock settico',
    sommario: 'Shock distributivo: vasoplegia, CO alta, SVR basse, ipovolemia relativa.',
    scheda:
      'Vasoplegia NO-mediata e downregulation β. Obiettivi: riempimento, noradrenalina ± vasopressina, ' +
      'idrocortisone se refrattario (ripristina la responsività). Attenzione al lattato da β2 (non ipoperfusione).',
    patch: {
      bloodVolume: 4500,
      rhythm: { hr: 100, rhythm: 'sinus', pr: 0.16, escapeRate: 38, afVariability: 0.2 },
    },
    metabolic: {
      extraNO: 0.55,
      betaDownreg: 0.45,
      temperature: 38.6,
      ph: 7.28,
      potassium: 4.0,
      magnesium: 0.8,
    },
    reflex: { preset: 'awake' },
  },
  {
    id: 'cardiogeno',
    nome: 'Shock cardiogeno',
    sommario: 'Bassa contrattilità del VS, CO bassa, pressioni di riempimento alte.',
    scheda:
      'Pompa inefficace: PAOP alta, CO bassa, SVR alte (compenso). Obiettivi: inotropi (dobutamina, milrinone), ' +
      'ridurre il postcarico con cautela, IABP. Evita il sovraccarico di volume.',
    patch: {
      lv: { ees: 1.1, vd: 10, p0: 0.2, lambda: 0.05, v0: 10 },
      rv: { ees: 0.35, vd: 15, p0: 0.45, lambda: 0.024, v0: 15 },
      bloodVolume: 5200,
    },
    reflex: { preset: 'awake' },
  },
  {
    id: 'vd-acuto',
    nome: 'Scompenso destro acuto',
    sommario: 'Disfunzione del VD con postcarico polmonare elevato e shift settale.',
    scheda:
      'Il VD dilatato spinge il setto verso il VS (interdipendenza) e ne riduce il riempimento. Obiettivi: ' +
      'ridurre la PVR (NO inalato/milrinone), sostenere il VD (noradrenalina), evitare sovraccarico di volume.',
    patch: {
      pulmonary: { zc: 0.03, r: 0.22, ca: 3.5, va0: 110, cv: 16, vv0: 200, rv: 0.012 },
      rv: { ees: 0.3, vd: 15, p0: 0.5, lambda: 0.024, v0: 15 },
    },
    reflex: { preset: 'awake' },
  },
  {
    id: 'anafilassi',
    nome: 'Anafilassi',
    sommario: 'Vasoplegia profonda + fuga capillare (ipovolemia) + tachicardia.',
    scheda:
      'Vasodilatazione massiva e perdita di volume. Obiettivi: ADRENALINA (prima linea), liquidi, ' +
      'eventuale vasopressina nelle forme refrattarie. Trendelenburg, ossigeno.',
    patch: {
      bloodVolume: 4100,
      rhythm: { hr: 115, rhythm: 'sinus', pr: 0.16, escapeRate: 38, afVariability: 0.2 },
    },
    metabolic: { extraNO: 0.6 },
    reflex: { preset: 'awake' },
  },
  {
    id: 'neurogeno',
    nome: 'Shock neurogeno',
    sommario: 'Perdita del tono simpatico: vasodilatazione + bradicardia relativa.',
    scheda:
      'Lesione midollare alta: vasoplegia e venodilatazione senza tachicardia compensatoria (riflesso perso). ' +
      'Obiettivi: vasopressori (noradrenalina), atropina per la bradicardia, liquidi con cautela.',
    patch: {
      bloodVolume: 4700,
      systemic: { zc: 0.045, r: 0.92, ca: 1.3, va0: 650, cv: 140, vv0: 2650, rv: 0.05 },
      rhythm: { hr: 55, rhythm: 'sinus', pr: 0.16, escapeRate: 38, afVariability: 0.2 },
    },
    metabolic: { extraNO: 0.2 },
    reflex: { preset: 'denervated' },
  },
  {
    id: 'spinale',
    nome: 'Ipotensione da anestesia spinale',
    sommario: 'Simpaticectomia sotto il blocco: vasodilatazione e venodilatazione.',
    scheda:
      'Blocco neurassiale: calo di SVR e precarico, bradicardia se blocco alto (fibre cardioacceleratrici). ' +
      'Obiettivi: efedrina/fenilefrina, liquidi, spostamento uterino in ostetricia.',
    patch: {
      bloodVolume: 4700,
      systemic: { zc: 0.045, r: 0.78, ca: 1.3, va0: 650, cv: 140, vv0: 2600, rv: 0.05 },
    },
    reflex: { preset: 'neuraxial' },
  },
  {
    id: 'vasoplegia-cec',
    nome: 'Vasoplegia post-CEC',
    sommario: 'Sindrome vasoplegica dopo circolazione extracorporea: SVR molto basse.',
    scheda:
      'Eccesso di NO/cGMP dopo bypass. Obiettivi: noradrenalina, vasopressina, blu di metilene (inibizione sGC) ' +
      'nelle forme refrattarie. CO spesso conservata/alta.',
    patch: { bloodVolume: 5000 },
    metabolic: { extraNO: 0.6, ph: 7.32 },
    reflex: { preset: 'anesthesia' },
  },
  {
    id: 'emorragico',
    nome: 'Ipovolemia emorragica',
    sommario: 'Perdita ematica: precarico basso, tachicardia compensatoria, SVR alte.',
    scheda:
      'Shock emorragico compensato → scompensato. Obiettivi: controllo dell’emorragia e RIEMPIMENTO; ' +
      'i vasopressori non sostituiscono il volume. Attenzione ai venodilatatori (crollo della CO).',
    patch: { bloodVolume: 3500 },
    reflex: { preset: 'awake' },
  },
  {
    id: 'embolia',
    nome: 'Embolia polmonare massiva',
    sommario: 'Ostruzione polmonare acuta: PVR altissime, dilatazione e disfunzione del VD.',
    scheda:
      'Postcarico del VD acutamente elevato → dilatazione del VD, shift settale, caduta della CO del VS. ' +
      'Obiettivi: sostegno del VD, noradrenalina, ridurre la PVR, riperfusione (trombolisi/embolectomia).',
    patch: {
      pulmonary: { zc: 0.035, r: 0.3, ca: 2.8, va0: 110, cv: 16, vv0: 200, rv: 0.012 },
      rv: { ees: 0.45, vd: 15, p0: 0.5, lambda: 0.024, v0: 15 },
    },
    reflex: { preset: 'awake' },
  },
  {
    id: 'tamponamento',
    nome: 'Tamponamento cardiaco',
    sommario: 'Versamento pericardico: equalizzazione delle pressioni, polso paradosso.',
    scheda:
      'Il versamento comprime le camere: pressioni diastoliche equalizzate, polso paradosso > 10 mmHg, ' +
      'CO ridotta. Obiettivi: pericardiocentesi; nel frattempo volume e cronotropi, evitare bradicardia e vasodilatazione.',
    patch: {
      pericardium: { p0: 0.6, v0: 440, vk: 32, effusion: 280, pleuralTransmission: 1 },
      bloodVolume: 5200,
    },
    reflex: { preset: 'awake' },
  },
  {
    id: 'ipertensione-polmonare',
    nome: 'Ipertensione polmonare riacutizzata',
    sommario: 'IP cronica con VD ipertrofico, riacutizzata: PVR elevate.',
    scheda:
      'VD adattato (ipertrofico) ma vulnerabile: evitare ipossia/ipercapnia/acidosi (↑PVR). Obiettivi: ' +
      'vasodilatatori polmonari selettivi (NO inalato, milrinone), sostegno del VD, evitare il circolo vizioso del VD.',
    patch: {
      pulmonary: { zc: 0.035, r: 0.25, ca: 2.5, va0: 110, cv: 16, vv0: 200, rv: 0.012 },
      rv: { ees: 0.95, vd: 15, p0: 0.5, lambda: 0.03, v0: 15 },
    },
    metabolic: { ph: 7.33 },
    reflex: { preset: 'awake' },
  },
];

export const SCENARIO_BY_ID: Record<string, Scenario> = Object.fromEntries(SCENARIOS.map((s) => [s.id, s]));

/** Applica uno scenario a un motore + modulatore esistenti (reset di dosi, metabolico, riflesso). */
export function applyScenario(engine: CardioEngine, mod: ClinicalModulator, scenario: Scenario): void {
  const p = defaultParams();
  applyPatch(p, scenario.patch);
  engine.setParams(p);

  // Reset del modulatore.
  mod.pharmaco.dose.clear();
  mod.pharmaco.ce.clear();
  mod.pharmaco.nePool = 1;
  mod.pharmaco.nitrateTolerance = 0;
  mod.pharmaco.cyanide = 0;
  Object.assign(mod.metabolic, defaultMetabolic(), scenario.metabolic ?? {});
  mod.setReflex(scenario.reflex?.preset ?? 'awake', scenario.reflex?.enabled ?? true);
  mod.reflex.reset(mod.reflexSetpoint);
  if (scenario.doses)
    for (const [id, d] of Object.entries(scenario.doses)) mod.setDose(id as DrugId, d as number);
}

/** Costruisce un motore con il modulatore per uno scenario e lo porta a regime. */
export function buildScenario(
  scenario: Scenario,
  settle = 45,
): { engine: CardioEngine; mod: ClinicalModulator } {
  const engine = new CardioEngine();
  const mod = new ClinicalModulator();
  engine.addModulator(mod);
  applyScenario(engine, mod, scenario);
  engine.run(settle);
  return { engine, mod };
}
