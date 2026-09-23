import { create } from 'zustand';
import type { BeatMetrics, RespMetrics } from '../physiology/metrics';
import { applyPatch, cloneParams, type Params, type ParamsPatch } from '../physiology/params';
import {
  caseMorphology,
  caseParams,
  MORFOLOGIA_NORMALE,
  PATHOLOGY_BY_ID,
  type Morfologia,
} from '../pathologies/index';
import type { EngineStatus, FromWorker, ToWorker } from '../workers/protocol';
import { sampleBuffer } from './sampleBuffer';

interface SimulationState {
  /** Parametri obiettivo (quelli impostati dall'utente/preset; il motore li raggiunge gradualmente) */
  params: Params;
  paused: boolean;
  speed: number;
  beat: BeatMetrics | null;
  resp: RespMetrics | null;
  status: EngineStatus | null;
  simTime: number;
  realtime: number;
  /** Caso clinico corrente (null = normale) e gravità 0–1 */
  caseId: string | null;
  severity: number;
  morphology: Morfologia;
  setParams: (patch: ParamsPatch) => void;
  setPaused: (v: boolean) => void;
  setSpeed: (v: number) => void;
  /** Carica un nuovo caso (riparte da capo, senza terapie) */
  loadCase: (id: string | null, severity?: number) => void;
  /** Cambia la gravità del caso corrente (transizione graduale) */
  setSeverity: (s: number) => void;
  fluidBolus: (volume: number, seconds: number) => void;
  propofol: (mgPerKg: number) => void;
  reset: () => void;
}

let worker: Worker | null = null;
const send = (msg: ToWorker, transfer: Transferable[] = []) => worker?.postMessage(msg, transfer);

export const useSimulation = create<SimulationState>((set, get) => ({
  params: caseParams(null, 0),
  paused: false,
  speed: 1,
  beat: null,
  resp: null,
  status: null,
  simTime: 0,
  realtime: 0,
  caseId: null,
  severity: 0.6,
  morphology: { ...MORFOLOGIA_NORMALE },
  setParams: (patch) => {
    const next = cloneParams(get().params);
    applyPatch(next, patch);
    set({ params: next });
    send({ type: 'params', patch });
  },
  setPaused: (v) => {
    set({ paused: v });
    send({ type: 'pause', value: v });
  },
  setSpeed: (v) => {
    set({ speed: v });
    send({ type: 'speed', value: v });
  },
  loadCase: (id, severity = get().severity) => {
    const p = id ? (PATHOLOGY_BY_ID[id] ?? null) : null;
    const params = caseParams(p, severity);
    set({
      caseId: p?.id ?? null,
      severity,
      params,
      morphology: caseMorphology(p, severity),
      beat: null,
      resp: null,
      status: null,
    });
    sampleBuffer.clear();
    send({ type: 'reset', params: cloneParams(params) });
  },
  setSeverity: (s) => {
    const { caseId } = get();
    const p = caseId ? PATHOLOGY_BY_ID[caseId] : undefined;
    set({ severity: s });
    if (!p) return;
    set({ morphology: caseMorphology(p, s) });
    get().setParams(p.params(s));
  },
  fluidBolus: (volume, seconds) => {
    const next = cloneParams(get().params);
    next.bloodVolume += volume;
    set({ params: next });
    send({ type: 'fluid', volume, seconds });
  },
  propofol: (mgPerKg) => send({ type: 'propofol', mgPerKg }),
  reset: () => get().loadCase(get().caseId),
}));

/** Avvia il worker del motore (una sola volta). */
export function startEngine(): void {
  if (worker) return;
  worker = new Worker(new URL('../workers/engine.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (ev: MessageEvent<FromWorker>) => {
    const msg = ev.data;
    sampleBuffer.push(msg.samples, msg.count);
    send({ type: 'recycle', buffer: msg.samples.buffer as ArrayBuffer }, [msg.samples.buffer]);
    const patch: Partial<SimulationState> = {};
    if (msg.beat) patch.beat = msg.beat;
    if (msg.resp) patch.resp = msg.resp;
    if (msg.status) patch.status = msg.status;
    if (msg.beat || msg.resp) {
      patch.simTime = msg.t;
      patch.realtime = msg.realtime;
      useSimulation.setState(patch);
    }
  };
}
