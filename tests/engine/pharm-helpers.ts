import {
  CardioEngine,
  ClinicalModulator,
  type BeatMetrics,
  type DrugId,
  type MetabolicState,
  type ParamsPatch,
  type ReflexPreset,
  applyPatch,
  defaultParams,
} from '../../src/engine';

export interface RxOptions {
  patch?: ParamsPatch;
  preset?: ReflexPreset;
  reflex?: boolean;
  metabolic?: Partial<MetabolicState>;
  settle?: number;
}

/** Crea un motore con il modulatore clinico e lo porta a regime. */
export function buildRx(opts: RxOptions = {}): { engine: CardioEngine; mod: ClinicalModulator } {
  const p = defaultParams();
  if (opts.patch) applyPatch(p, opts.patch);
  const engine = new CardioEngine(p);
  const mod = new ClinicalModulator();
  if (opts.preset) mod.setReflex(opts.preset, opts.reflex ?? true);
  else if (opts.reflex === false) mod.setReflex('awake', false);
  if (opts.metabolic) Object.assign(mod.metabolic, opts.metabolic);
  engine.addModulator(mod);
  engine.run(opts.settle ?? 45);
  return { engine, mod };
}

/** Applica una o più dosi e lascia riequilibrare; restituisce l'ultimo battito. */
export function dose(
  engine: CardioEngine,
  mod: ClinicalModulator,
  doses: Partial<Record<DrugId, number>>,
  seconds = 120,
): BeatMetrics {
  for (const [id, d] of Object.entries(doses)) mod.setDose(id as DrugId, d as number);
  engine.run(seconds);
  return engine.currentBeat;
}

/** Snapshot indipendente dalle mutazioni successive. */
export function snap(b: BeatMetrics): BeatMetrics {
  return { ...b, districtFlow: [...b.districtFlow], districtFraction: [...b.districtFraction] };
}
