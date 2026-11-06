/**
 * Emodinamica — effetti collaterali CALCOLATI dallo stato corrente del sistema (spec §5):
 * non liste statiche. Ogni avviso riporta gravità, meccanismo in una riga e la variabile
 * che lo ha generato.
 */
import { DISTRICT_KEYS } from './districts';
import type { BeatMetrics } from './metrics';
import type { OxygenState } from './oxygen';
import type { DrugSignals } from './pharmacology';
import type { MetabolicState } from './therapy';

export type Severity = 'lieve' | 'moderato' | 'grave';

export interface Alert {
  id: string;
  titolo: string;
  gravita: Severity;
  /** Meccanismo in una riga. */
  meccanismo: string;
  /** Variabile (con valore) che ha generato l'avviso. */
  variabile: string;
}

const RANK: Record<Severity, number> = { grave: 3, moderato: 2, lieve: 1 };

function grade(x: number, moderato: number, grave: number): Severity {
  return x >= grave ? 'grave' : x >= moderato ? 'moderato' : 'lieve';
}

const f = (x: number, d = 0) => x.toFixed(d);

/** Soglie di flusso minimo per distretto (L/min) sotto cui segnalare ipoperfusione. */
const DISTRICT_LOW = [0.75, 0.6, 0.4, 0.12, 0.15, 0.6];

export function assessSideEffects(
  beat: BeatMetrics,
  ox: OxygenState,
  signals: DrugSignals | null,
  metabolic: MetabolicState,
): Alert[] {
  const s = signals;
  const out: Alert[] = [];

  // 1. Ischemia miocardica: domanda (SPTI) contro apporto (DPTI) → EVR di Buckberg.
  if (ox.evr < 0.7) {
    const sev = ox.evr < 0.4 ? 'grave' : ox.evr < 0.55 ? 'moderato' : 'lieve';
    out.push({
      id: 'ischemia',
      titolo: 'Ischemia miocardica',
      gravita: sev,
      meccanismo: 'Domanda sistolica (SPTI) superiore all’apporto diastolico (DPTI) subendocardico.',
      variabile: `EVR ${f(ox.evr, 2)} · CPP ${f(beat.cpp)} mmHg · MVO₂ ${f(ox.mvo2)} mL/min`,
    });
  }

  // 2. Rischio aritmico: occupazione β1 × FC × ischemia × K⁺/Mg²⁺.
  const hypoK = Math.max(0, 3.5 - metabolic.potassium);
  const hyperK = Math.max(0, metabolic.potassium - 5.5);
  const hypoMg = Math.max(0, 0.7 - metabolic.magnesium);
  const beta1 = s?.beta1 ?? 0;
  const arr =
    beta1 * Math.min(beat.hr / 80, 2.5) +
    (ox.evr < 0.5 ? 0.5 : 0) +
    hypoK * 0.6 +
    hypoMg * 1.5 +
    hyperK * 0.5;
  if (arr > 0.6) {
    out.push({
      id: 'aritmia',
      titolo: 'Rischio aritmico',
      gravita: grade(arr, 1.0, 1.8),
      meccanismo: 'Stimolo β1 × FC × ischemia × squilibrio di K⁺/Mg²⁺ abbassa la soglia aritmica.',
      variabile: `β1 ${f(beta1, 2)} · FC ${f(beat.hr)} · K⁺ ${f(metabolic.potassium, 1)} · Mg²⁺ ${f(metabolic.magnesium, 1)}`,
    });
  }

  // 3. Ipoperfusione regionale per singolo distretto.
  for (let i = 0; i < DISTRICT_KEYS.length; i++) {
    const q = beat.districtFlow[i]!;
    if (q < DISTRICT_LOW[i]!) {
      const ratio = q / DISTRICT_LOW[i]!;
      out.push({
        id: `ipoperfusione-${DISTRICT_KEYS[i]}`,
        titolo: `Ipoperfusione ${DISTRICT_KEYS[i]}`,
        gravita: grade(1 - ratio, 0.25, 0.5),
        meccanismo: 'Vasocostrizione o bassa gittata riducono il flusso del distretto sotto la soglia.',
        variabile: `Flusso ${DISTRICT_KEYS[i]} ${f(q, 2)} L/min · α1 ${f(s?.alpha1 ?? 0, 2)}`,
      });
    }
  }

  // 4. Ipoperfusione globale (shock): estrazione di O2 elevata, lattato anaerobico.
  if (ox.o2er > 0.55 || ox.lactateAnaerobic > 0.4) {
    out.push({
      id: 'ipoperfusione-globale',
      titolo: 'Ipoperfusione globale',
      gravita: grade(ox.o2er, 0.6, 0.72),
      meccanismo: 'DO₂ insufficiente per il VO₂: estrazione di O₂ elevata e lattato anaerobico.',
      variabile: `O₂ER ${f(ox.o2er * 100)} % · SvO₂ ${f(ox.svo2 * 100)} % · DO₂ ${f(ox.do2)} mL/min`,
    });
  }

  // 5. Lattato da β2: glicolisi aerobia, NON ipoperfusione (etichettato esplicitamente).
  if (ox.lactateBeta2 > 0.3) {
    out.push({
      id: 'lattato-beta2',
      titolo: 'Lattato da β2 (glicolisi aerobia)',
      gravita: grade(ox.lactateBeta2, 0.6, 1.2),
      meccanismo: 'Stimolo β2 → glicolisi aerobia: iperlattacidemia NON da ipoperfusione.',
      variabile: `β2 ${f(s?.beta2 ?? 0, 2)} · lattato +${f(ox.lactateBeta2, 1)} mmol/L`,
    });
  }

  // 6. Iponatriemia da V2 (vasopressina/terlipressina).
  if ((s?.v2 ?? 0) > 0.3) {
    out.push({
      id: 'iponatriemia',
      titolo: 'Rischio di iponatriemia (V2)',
      gravita: grade(s!.v2, 0.5, 0.8),
      meccanismo: 'Attivazione dei recettori V2: ritenzione di acqua libera.',
      variabile: `V2 ${f(s!.v2, 2)}`,
    });
  }

  // 7. Ipertensione polmonare da α1 e sovraccarico del VD.
  if (beat.papm > 24) {
    out.push({
      id: 'ipertensione-polmonare',
      titolo: 'Ipertensione polmonare',
      gravita: grade(beat.papm, 30, 40),
      meccanismo: 'Vasocostrizione polmonare (α1) e/o sovraccarico pressorio del VD.',
      variabile: `PAPm ${f(beat.papm)} mmHg · VTD VD ${f(beat.rvedv)} mL · α1 ${f(s?.alpha1 ?? 0, 2)}`,
    });
  }

  // 8. Inibizione della HPV da vasodilatatori → ↑shunt → ↓SpO2.
  if (ox.shunt > 0.08 && ox.spo2 < 0.95) {
    out.push({
      id: 'shunt-hpv',
      titolo: 'Inibizione della vasocostrizione ipossica polmonare',
      gravita: grade(ox.shunt, 0.2, 0.35),
      meccanismo: 'I vasodilatatori inibiscono la HPV: aumenta lo shunt e cala la SpO₂.',
      variabile: `Shunt ${f(ox.shunt * 100)} % · SpO₂ ${f(ox.spo2 * 100)} % · NO art. ${f(s?.noArterial ?? 0, 2)}`,
    });
  }

  // 9. Metemoglobinemia e rischio serotoninergico del blu di metilene.
  if ((s?.methemoglobin ?? 0) > 0.015 || (s?.sGC ?? 0) > 0.3) {
    const met = s?.methemoglobin ?? 0;
    out.push({
      id: 'blu-metilene',
      titolo: 'Blu di metilene: metemoglobina / serotonina',
      gravita: met > 0.1 ? 'grave' : met > 0.03 ? 'moderato' : 'lieve',
      meccanismo: 'Alte dosi: metemoglobinemia (SpO₂ inattendibile) e rischio serotoninergico con SSRI.',
      variabile: `MetHb ${f(met * 100, 1)} % · sGC ${f(s?.sGC ?? 0, 2)}`,
    });
  }

  // 10. Tossicità da cianuro del nitroprussiato (dose cumulativa × durata).
  if ((s?.cyanide ?? 0) > 0.6) {
    out.push({
      id: 'cianuro',
      titolo: 'Tossicità da cianuro (nitroprussiato)',
      gravita: grade(s!.cyanide, 1.5, 3),
      meccanismo: 'Accumulo di cianuro proporzionale alla dose cumulativa e alla durata.',
      variabile: `Cianuro ${f(s!.cyanide, 2)} (cumulativo)`,
    });
  }

  // 11. Rischio di necrosi da stravaso dei vasocostrittori.
  if ((s?.alpha1 ?? 0) > 0.5) {
    out.push({
      id: 'stravaso',
      titolo: 'Rischio di necrosi da stravaso',
      gravita: grade(s!.alpha1, 0.8, 1.3),
      meccanismo: 'Vasocostrittore potente (α1): ischemia tissutale in caso di stravaso periferico.',
      variabile: `α1 ${f(s!.alpha1, 2)}`,
    });
  }

  out.sort((a, b) => RANK[b.gravita] - RANK[a.gravita]);
  return out;
}
