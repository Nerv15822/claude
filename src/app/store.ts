/**
 * Emodinamica — stato dell'applicazione (Zustand) e ponte verso il Web Worker.
 *
 * I campioni dei tracciati (250 Hz) NON passano per lo stato reattivo: sono scritti in un
 * oggetto mutabile letto dai grafici in un loop rAF, per non forzare un re-render a 60 Hz.
 * Solo i dati per battito (metriche, O₂, avvisi) aggiornano lo stato reattivo.
 */
import { create } from 'zustand';
import {
  type Alert,
  type BeatMetrics,
  DRUG_IDS,
  type DrugId,
  type OxygenState,
  type ReflexPreset,
} from '../engine';
import { SCENARIO_BY_ID } from './scenarios';
import type { EngineStatus, FromWorker, ToWorker } from './worker/protocol';

export type ViewMode = 'estetica' | 'analitica';
export type AnalyticVar = 'stress' | 'perfusione' | 'mvo2';

const samples: { buffer: Float32Array<ArrayBufferLike>; count: number } = {
  buffer: new Float32Array(0),
  count: 0,
};
export function getSamples(): { buffer: Float32Array<ArrayBufferLike>; count: number } {
  return samples;
}

let worker: Worker | null = null;

function emptyDoses(): Record<DrugId, number> {
  return Object.fromEntries(DRUG_IDS.map((id) => [id, 0])) as Record<DrugId, number>;
}

interface AppState {
  started: boolean;
  scenarioId: string;
  doses: Record<DrugId, number>;
  drugA: DrugId;
  drugB: DrugId | null;
  bloodVolume: number;
  peep: number;
  ventMode: 'apnea' | 'spontaneous' | 'ppv';
  ph: number;
  reflexPreset: ReflexPreset;
  reflexEnabled: boolean;
  speed: number;
  paused: boolean;
  viewMode: ViewMode;
  analyticVar: AnalyticVar;
  showSection: boolean;
  bloom: boolean;

  beat: BeatMetrics | null;
  oxygen: OxygenState | null;
  alerts: Alert[];
  status: EngineStatus | null;
  baseline: BeatMetrics | null;
  baselineOxygen: OxygenState | null;
  /** Numero di battiti dall'ultimo cambio scenario (per catturare il basale). */
  beatsSinceScenario: number;

  init(): void;
  setScenario(id: string): void;
  setDose(id: DrugId, dose: number): void;
  setDrugA(id: DrugId): void;
  setDrugB(id: DrugId | null): void;
  setBloodVolume(v: number): void;
  setPeep(v: number): void;
  setVentMode(m: 'apnea' | 'spontaneous' | 'ppv'): void;
  setPh(v: number): void;
  setReflex(preset: ReflexPreset, enabled: boolean): void;
  setSpeed(v: number): void;
  setPaused(v: boolean): void;
  setViewMode(m: ViewMode): void;
  setAnalyticVar(v: AnalyticVar): void;
  setShowSection(v: boolean): void;
  setBloom(v: boolean): void;
}

function send(msg: ToWorker): void {
  worker?.postMessage(msg);
}

export const useStore = create<AppState>((set, get) => ({
  started: false,
  scenarioId: 'normale',
  doses: emptyDoses(),
  drugA: 'noradrenaline',
  drugB: null,
  bloodVolume: 5000,
  peep: 5,
  ventMode: 'spontaneous',
  ph: 7.4,
  reflexPreset: 'awake',
  reflexEnabled: true,
  speed: 1,
  paused: false,
  viewMode: 'estetica',
  analyticVar: 'stress',
  showSection: false,
  bloom: true,

  beat: null,
  oxygen: null,
  alerts: [],
  status: null,
  baseline: null,
  baselineOxygen: null,
  beatsSinceScenario: 0,

  init() {
    if (worker) return;
    worker = new Worker(new URL('./worker/emodinamica.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (ev: MessageEvent<FromWorker>) => {
      const m = ev.data;
      if (m.type === 'samples') {
        samples.buffer = m.buffer;
        samples.count = m.count;
      } else {
        const n = get().beatsSinceScenario + 1;
        const takeBaseline = n === 3; // terzo battito dopo il cambio: stato "a regime" per i delta
        set((s) => ({
          beat: m.beat,
          oxygen: m.oxygen,
          alerts: m.alerts,
          status: m.status,
          beatsSinceScenario: n,
          baseline: takeBaseline || !s.baseline ? m.beat : s.baseline,
          baselineOxygen: takeBaseline || !s.baselineOxygen ? m.oxygen : s.baselineOxygen,
        }));
      }
    };
    send({ type: 'init', scenarioId: get().scenarioId });
    set({ started: true });
  },

  setScenario(id) {
    const sc = SCENARIO_BY_ID[id];
    const doses = emptyDoses();
    if (sc?.doses) for (const [d, v] of Object.entries(sc.doses)) doses[d as DrugId] = v as number;
    set({
      scenarioId: id,
      doses,
      ph: sc?.metabolic?.ph ?? 7.4,
      bloodVolume: (sc?.patch.bloodVolume as number | undefined) ?? 5000,
      reflexPreset: sc?.reflex?.preset ?? 'awake',
      reflexEnabled: sc?.reflex?.enabled ?? true,
      baseline: null,
      baselineOxygen: null,
      beatsSinceScenario: 0,
    });
    send({ type: 'scenario', scenarioId: id });
  },

  setDose(id, dose) {
    set((s) => ({ doses: { ...s.doses, [id]: dose } }));
    send({ type: 'dose', id, dose });
  },
  setDrugA(id) {
    set({ drugA: id });
  },
  setDrugB(id) {
    set({ drugB: id });
    if (id) send({ type: 'dose', id, dose: get().doses[id] });
  },
  setBloodVolume(v) {
    set({ bloodVolume: v });
    send({ type: 'bloodVolume', value: v });
  },
  setPeep(v) {
    set({ peep: v });
    send({ type: 'peep', value: v });
  },
  setVentMode(m) {
    set({ ventMode: m });
    send({ type: 'ventMode', mode: m });
  },
  setPh(v) {
    set({ ph: v });
    send({ type: 'metabolic', patch: { ph: v } });
  },
  setReflex(preset, enabled) {
    set({ reflexPreset: preset, reflexEnabled: enabled });
    send({ type: 'reflex', preset, enabled });
  },
  setSpeed(v) {
    set({ speed: v });
    send({ type: 'speed', value: v });
  },
  setPaused(v) {
    set({ paused: v });
    send({ type: 'paused', value: v });
  },
  setViewMode(m) {
    set({ viewMode: m });
  },
  setAnalyticVar(v) {
    set({ analyticVar: v });
  },
  setShowSection(v) {
    set({ showSection: v });
  },
  setBloom(v) {
    set({ bloom: v });
  },
}));
