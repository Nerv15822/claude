import type { PVLoopData, StarlingPoint } from '../physiology/analysis';
import type { BeatMetrics, RespMetrics } from '../physiology/metrics';
import type { Params, ParamsPatch } from '../physiology/params';

/** Messaggi main → worker */
export type ToWorker =
  | { type: 'params'; patch: ParamsPatch }
  | { type: 'reset'; params: Params }
  | { type: 'speed'; value: number }
  | { type: 'pause'; value: boolean }
  /** Restituisce un buffer al pool del worker (evita allocazioni) */
  | { type: 'recycle'; buffer: ArrayBuffer };

/** Messaggi worker → main */
export interface FrameMessage {
  type: 'frame';
  /** Campioni consecutivi, SAMPLE_SIZE float ciascuno */
  samples: Float32Array;
  count: number;
  t: number;
  beat: BeatMetrics | null;
  resp: RespMetrics | null;
  /** Rapporto tempo simulato / tempo reale effettivo */
  realtime: number;
}
export type FromWorker = FrameMessage;

/** Un campione ogni 8 passi da 0.5 ms → 250 Hz */
export const SAMPLE_EVERY = 8;
/** Capacità di un pacchetto (campioni) */
export const FRAME_CAPACITY = 256;

/** Richieste al worker di analisi */
export type AnalysisRequest = { type: 'reference' } | { type: 'starling'; id: number; params: Params };

export type AnalysisResponse =
  | { type: 'reference'; loop: PVLoopData; curve: StarlingPoint[] }
  | { type: 'starling'; id: number; curve: StarlingPoint[] };
