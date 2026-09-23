import { CardioEngine, averageBeats } from '../../src/physiology/engine';
import type { BeatMetrics } from '../../src/physiology/metrics';
import type { ParamsPatch } from '../../src/physiology/params';

export interface SteadyResult {
  engine: CardioEngine;
  beat: BeatMetrics;
}

/**
 * Porta a regime il modello (con una patch opzionale) e media le metriche su una finestra.
 * Per i test di meccanica il baroriflesso è disattivato, salvo che la patch lo specifichi.
 */
export function steady(patch: ParamsPatch = {}, settle = 40, window = 10, dt?: number): SteadyResult {
  const engine = new CardioEngine(dt === undefined ? {} : { dt });
  engine.setParams({ reflex: { enabled: false }, ...patch });
  engine.settleParams();
  engine.advance(settle);
  const beat = averageBeats(engine, window);
  return { engine, beat };
}
