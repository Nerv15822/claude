/**
 * Emodinamica — protocollo di messaggi tra thread principale e Web Worker del solutore.
 * Il worker esegue il motore a passo fisso; il thread principale fa solo rendering interpolato.
 */
import type { Alert, BeatMetrics, DrugId, MetabolicState, OxygenState, ReflexPreset } from '../../engine';

/** Campi di ciascun campione del tracciato (250 Hz). */
export const SAMPLE = {
  t: 0,
  pao: 1, // pressione aortica
  plv: 2, // pressione VS
  pla: 3, // pressione AS
  pra: 4, // pressione AD
  ppa: 5, // pressione arteria polmonare (prossimale)
  prv: 6, // pressione VD
  vlv: 7, // volume VS
  vrv: 8, // volume VD
} as const;
export const SAMPLE_STRIDE = 9;
/** Frequenza di campionamento dei tracciati (Hz). */
export const SAMPLE_HZ = 250;
/** Secondi di tracciato mantenuti nel ring. */
export const WINDOW_SECONDS = 6;

export type ToWorker =
  | { type: 'init'; scenarioId: string }
  | { type: 'scenario'; scenarioId: string }
  | { type: 'dose'; id: DrugId; dose: number }
  | { type: 'metabolic'; patch: Partial<MetabolicState> }
  | { type: 'reflex'; preset: ReflexPreset; enabled: boolean }
  | { type: 'bloodVolume'; value: number }
  | { type: 'peep'; value: number }
  | { type: 'ventMode'; mode: 'apnea' | 'spontaneous' | 'ppv' }
  | { type: 'speed'; value: number }
  | { type: 'paused'; value: boolean };

export interface EngineStatus {
  /** Concentrazioni al sito effettore per farmaco impostato (unità di dose). */
  ce: Partial<Record<DrugId, number>>;
  responsiveness: number;
  nePool: number;
  reflexHr: number;
}

export type FromWorker =
  | { type: 'samples'; buffer: Float32Array; count: number }
  | { type: 'beat'; beat: BeatMetrics; oxygen: OxygenState; alerts: Alert[]; status: EngineStatus };
