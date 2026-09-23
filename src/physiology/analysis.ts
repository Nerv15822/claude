/**
 * Analisi offline sul modello (eseguite in un worker dedicato, mai nel loop in tempo reale):
 * - curva di Frank-Starling: gittata sistolica vs PTD del VS al variare del precarico
 * - loop pressione-volume di riferimento (caso normale)
 */
import { CardioEngine, F, SAMPLE_SIZE, averageBeats } from './engine';
import { cloneParams, type Params } from './params';

export interface StarlingPoint {
  /** Volemia (mL) */
  volume: number;
  lvEdp: number;
  lvEdv: number;
  /** Gittata sistolica anterograda (mL) */
  sv: number;
  co: number;
  raMean: number;
}

/** Offset di volemia esplorati rispetto al valore corrente (mL). */
export const STARLING_OFFSETS = [-1400, -1100, -800, -500, -250, 0, 300, 600, 1000, 1500];

/**
 * Curva di Frank-Starling del VS con i parametri dati, calcolata in apnea per eliminare la variabilità
 * respiratoria. Il precarico viene variato istantaneamente e ogni punto è misurato dopo un transitorio.
 */
export function computeStarlingCurve(params: Params, settle = 8, measure = 2): StarlingPoint[] {
  const p = cloneParams(params);
  p.ventilation.mode = 'apnea';
  // Curva del cuore a tono autonomico fisso: il riflesso compenserebbe le variazioni di precarico
  p.reflex.enabled = false;
  const base = p.bloodVolume;
  const engine = new CardioEngine({ params: p });
  engine.setBloodVolumeImmediate(base + STARLING_OFFSETS[0]!);
  engine.advance(settle * 2);
  const out: StarlingPoint[] = [];
  for (const off of STARLING_OFFSETS) {
    const volume = base + off;
    engine.setBloodVolumeImmediate(volume);
    engine.advance(settle);
    const b = averageBeats(engine, measure);
    out.push({ volume, lvEdp: b.lvEdp, lvEdv: b.lvEdv, sv: b.forwardSv, co: b.co, raMean: b.raMean });
  }
  return out;
}

export interface PVLoopData {
  /** Coppie (V, P) consecutive: [V0, P0, V1, P1, ...] */
  lv: Float32Array;
  rv: Float32Array;
}

/** Loop PV di un battito a regime (in apnea). */
export function computeReferenceLoop(params: Params, settle = 30): PVLoopData {
  const p = cloneParams(params);
  p.ventilation.mode = 'apnea';
  const engine = new CardioEngine({ params: p });
  engine.advance(settle);
  const start = engine.beatCount;
  while (engine.beatCount === start) engine.step();
  const lv: number[] = [];
  const rv: number[] = [];
  const s = new Float64Array(SAMPLE_SIZE);
  const current = engine.beatCount;
  let k = 0;
  while (engine.beatCount === current) {
    engine.step();
    if (k++ % 4 === 0) {
      engine.writeSample(s, 0);
      lv.push(s[F.vLV]!, s[F.pLV]!);
      rv.push(s[F.vRV]!, s[F.pRV]!);
    }
  }
  return { lv: new Float32Array(lv), rv: new Float32Array(rv) };
}
