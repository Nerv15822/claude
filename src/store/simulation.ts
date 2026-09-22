import { create } from 'zustand';
import type { BeatMetrics, RespMetrics } from '../physiology/metrics';
import { applyPatch, cloneParams, defaultParams, type Params, type ParamsPatch } from '../physiology/params';
import type { FromWorker, ToWorker } from '../workers/protocol';
import { sampleBuffer } from './sampleBuffer';

interface SimulationState {
  params: Params;
  paused: boolean;
  speed: number;
  beat: BeatMetrics | null;
  resp: RespMetrics | null;
  simTime: number;
  realtime: number;
  setParams: (patch: ParamsPatch) => void;
  setPaused: (v: boolean) => void;
  setSpeed: (v: number) => void;
  reset: () => void;
}

let worker: Worker | null = null;
const send = (msg: ToWorker, transfer: Transferable[] = []) => worker?.postMessage(msg, transfer);

export const useSimulation = create<SimulationState>((set, get) => ({
  params: defaultParams(),
  paused: false,
  speed: 1,
  beat: null,
  resp: null,
  simTime: 0,
  realtime: 0,
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
  reset: () => {
    const params = defaultParams();
    set({ params, beat: null, resp: null });
    sampleBuffer.clear();
    send({ type: 'reset', params: cloneParams(params) });
  },
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
    if (msg.beat || msg.resp) {
      patch.simTime = msg.t;
      patch.realtime = msg.realtime;
      useSimulation.setState(patch);
    }
  };
}
