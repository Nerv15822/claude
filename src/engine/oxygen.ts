/**
 * Emodinamica — trasporto di ossigeno e consumo miocardico.
 *
 * CaO2, CvO2, DO2, VO2, SvO2 (Fick), estrazione di O2, lattato, e flusso + DO2 per ciascuno
 * dei sei distretti. MVO2 (consumo miocardico) ed EVR di Buckberg (bilancio apporto/domanda
 * subendocardico).
 *
 * Requisito esplicito (spec §4): deve essere possibile osservare la MAP in aumento con la
 * DO2 in calo (p.es. vasocostrittore puro: MAP↑ ma CO↓ → DO2↓). È il concetto centrale.
 */
import { DISTRICT_COUNT, districtIndex } from './districts';
import type { BeatMetrics } from './metrics';
import type { Params } from './params';
import type { DrugSignals } from './pharmacology';
import { clamp } from './units';

export interface OxygenState {
  /** Contenuto arterioso di O2 (mL/dL) */
  cao2: number;
  /** Contenuto venoso misto di O2 (mL/dL) */
  cvo2: number;
  /** Trasporto di O2 (mL/min) */
  do2: number;
  /** Consumo di O2 (mL/min) */
  vo2: number;
  /** Saturazione arteriosa effettiva (0–1) */
  sao2: number;
  /** SpO2 mostrata (0–1): può divergere da SaO2 reale col blu di metilene */
  spo2: number;
  /** Saturazione venosa mista (0–1) */
  svo2: number;
  /** Estrazione di O2 (0–1) */
  o2er: number;
  /** Frazione di shunt polmonare (0–1) */
  shunt: number;
  /** Lattato (mmol/L) */
  lactate: number;
  /** Componente del lattato da β2 (glicolisi aerobia, NON ipoperfusione) */
  lactateBeta2: number;
  /** Componente anaerobica del lattato (ipoperfusione globale) */
  lactateAnaerobic: number;
  /** Consumo miocardico di O2 (mL O2/min, indicativo) */
  mvo2: number;
  /** Rapporto di vitalità endocardica (Buckberg) = DPTI/SPTI */
  evr: number;
  /** DO2 per distretto (mL/min) */
  districtDo2: number[];
}

/** Durata approssimata della sistole (s) in funzione della FC (accorciamento tipo Weissler). */
function systolicDuration(hr: number): number {
  const rr = 60 / Math.max(hr, 1);
  return clamp(0.33 * Math.sqrt(rr / (60 / 70)), 0.16, 0.42);
}

export interface OxygenInputs {
  /** Temperatura centrale (°C) per il Q10 del VO2. */
  temperature: number;
}

/**
 * Calcola lo stato di ossigenazione dal battito corrente, dai parametri e dai segnali
 * farmacologici (opzionali). Risolve SaO2/SvO2 con lo shunt in poche iterazioni.
 */
export function computeOxygen(
  beat: BeatMetrics,
  p: Params,
  signals: DrugSignals | null,
  inputs: OxygenInputs,
): OxygenState {
  const hb = p.oxygen.hb;
  const sao2Base = p.oxygen.sao2;
  const co = Math.max(beat.co, 0.3); // L/min

  // VO2: basale × Q10 (temperatura) + termogenesi β2.
  const tempFactor = Math.pow(2, (inputs.temperature - 37) / 10); // Q10 ≈ 2
  const beta2 = signals?.beta2 ?? 0;
  const vo2 = p.oxygen.vo2 * tempFactor * (1 + 0.25 * beta2);

  // Shunt: la vasodilatazione inibisce la vasocostrizione ipossica polmonare (HPV) → ↑shunt.
  const noArterial = signals?.noArterial ?? 0;
  const shunt = clamp(p.oxygen.shuntFraction + 0.11 * clamp(noArterial, 0, 3), 0.01, 0.55);
  const endCap = sao2Base; // saturazione di fine capillare polmonare

  // Iterazione SaO2 ↔ SvO2 attraverso lo shunt (venous admixture).
  let svo2 = 0.65;
  let sao2 = sao2Base;
  for (let i = 0; i < 4; i++) {
    sao2 = clamp(endCap * (1 - shunt) + svo2 * shunt, 0.4, 1);
    svo2 = clamp(sao2 - vo2 / Math.max(co * 1.34 * hb * 10, 1), 0.1, 0.99);
  }

  const cao2 = 1.34 * hb * sao2 + 0.003 * (sao2 * 100);
  const cvo2 = 1.34 * hb * svo2 + 0.003 * (svo2 * 100);
  const do2 = co * cao2 * 10;
  const o2er = clamp((sao2 - svo2) / Math.max(sao2, 0.01), 0, 1);

  // Lattato: componente anaerobica (estrazione > ~0.6) + glicolisi aerobia da β2.
  const lactateAnaerobic = Math.max(0, o2er - 0.6) * 18;
  const lactateBeta2 = 0.9 * beta2;
  const lactate = clamp(0.9 + lactateAnaerobic + lactateBeta2, 0.4, 20);

  // MVO2 (indicativo): basale + lavoro energetico (PVA · FC).
  const mvo2 = 2 + 0.3 * beat.pva * beat.hr;

  // EVR di Buckberg: DPTI (apporto diastolico) / SPTI (domanda sistolica).
  const ts = systolicDuration(beat.hr);
  const rr = 60 / Math.max(beat.hr, 1);
  const td = Math.max(rr - ts, 0.05);
  const dpti = Math.max(beat.cpp, 0) * td; // apporto ∝ gradiente di perfusione × tempo diastolico
  const meanSystolic = (beat.pas + beat.map) / 2; // tensione sistolica media (non il solo picco)
  const spti = meanSystolic * ts; // domanda ∝ tensione sistolica × tempo sistolico
  const evr = spti > 1e-6 ? dpti / spti : 0;

  const districtDo2 = new Array<number>(DISTRICT_COUNT);
  for (let i = 0; i < DISTRICT_COUNT; i++) {
    districtDo2[i] = beat.districtFlow[i]! * cao2 * 10;
  }

  return {
    cao2,
    cvo2,
    do2,
    vo2,
    sao2,
    spo2: sao2, // la SpO2 misurata è alterata dalla metemoglobina negli effetti collaterali
    svo2,
    o2er,
    shunt,
    lactate,
    lactateBeta2,
    lactateAnaerobic,
    mvo2,
    evr,
    districtDo2,
  };
}

/** Indici utili per gli effetti collaterali. */
export const CORONARY = districtIndex('coronary');
export const CEREBRAL = districtIndex('cerebral');
