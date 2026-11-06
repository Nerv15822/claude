import {
  CardioEngine,
  type BeatMetrics,
  type ParamsPatch,
  applyPatch,
  defaultParams,
} from '../../src/engine';

/** Crea un motore con una patch di parametri e lo porta a regime, restituendo l'ultimo battito. */
export function steady(patch: ParamsPatch = {}, seconds = 35): { engine: CardioEngine; beat: BeatMetrics } {
  const p = defaultParams();
  applyPatch(p, patch);
  const engine = new CardioEngine(p);
  engine.run(seconds);
  return { engine, beat: engine.currentBeat };
}

/** Verifica che un valore sia nell'intervallo [lo, hi]. */
export function inRange(x: number, lo: number, hi: number): boolean {
  return x >= lo && x <= hi;
}
