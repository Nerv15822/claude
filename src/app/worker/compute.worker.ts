/**
 * Emodinamica — worker di calcolo per la modalità Confronto: data una coppia farmaco/dose
 * sullo stesso substrato (scenario), porta a regime due motori indipendenti e restituisce
 * le metriche + trasporto di O₂ + avviso principale di ciascuno.
 */
import {
  CardioEngine,
  ClinicalModulator,
  type Alert,
  type BeatMetrics,
  type DrugId,
  type OxygenState,
} from '../../engine';
import { SCENARIO_BY_ID, applyScenario } from '../scenarios';

export interface CompareReq {
  scenarioId: string;
  a: { id: DrugId; dose: number };
  b: { id: DrugId; dose: number };
}
export interface CompareArm {
  beat: BeatMetrics;
  oxygen: OxygenState;
  alerts: Alert[];
}
export interface CompareRes {
  a: CompareArm;
  b: CompareArm;
}

function runArm(scenarioId: string, id: DrugId, dose: number): CompareArm {
  const engine = new CardioEngine();
  const mod = new ClinicalModulator();
  engine.addModulator(mod);
  const sc = SCENARIO_BY_ID[scenarioId] ?? SCENARIO_BY_ID.normale!;
  applyScenario(engine, mod, sc);
  engine.run(35);
  if (dose > 0) mod.setDose(id, dose);
  engine.run(70);
  const { oxygen, alerts } = mod.assess(engine);
  return { beat: engine.currentBeat, oxygen, alerts };
}

self.onmessage = (ev: MessageEvent<CompareReq>) => {
  const { scenarioId, a, b } = ev.data;
  const res: CompareRes = {
    a: runArm(scenarioId, a.id, a.dose),
    b: runArm(scenarioId, b.id, b.dose),
  };
  (self as unknown as Worker).postMessage(res);
};
