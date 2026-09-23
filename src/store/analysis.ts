import { create } from 'zustand';
import type { PVLoopData, StarlingPoint } from '../physiology/analysis';
import { cloneParams, type Params } from '../physiology/params';
import type { AnalysisRequest, AnalysisResponse } from '../workers/protocol';
import { useSimulation } from './simulation';

interface AnalysisState {
  referenceLoop: PVLoopData | null;
  referenceCurve: StarlingPoint[] | null;
  curve: StarlingPoint[] | null;
  computing: boolean;
}

export const useAnalysis = create<AnalysisState>(() => ({
  referenceLoop: null,
  referenceCurve: null,
  curve: null,
  computing: false,
}));

let worker: Worker | null = null;
let requestId = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
let busy = false;
let pending: Params | null = null;

function send(req: AnalysisRequest) {
  worker?.postMessage(req);
}

function requestCurve(params: Params) {
  if (busy) {
    pending = params;
    return;
  }
  busy = true;
  useAnalysis.setState({ computing: true });
  send({ type: 'starling', id: ++requestId, params: withReflexTone(params) });
}

/** Congela lo stato attuale del baroriflesso nei parametri (la curva è calcolata a tono fisso). */
function withReflexTone(params: Params): Params {
  const p = cloneParams(params);
  const r = useSimulation.getState().status?.reflex;
  if (r) {
    p.rhythm.hr *= r.hr;
    p.systemic.r *= r.resistance;
    p.systemic.vv0 *= r.venous;
    p.lv.ees *= r.contractility;
    p.rv.ees *= r.contractility;
  }
  return p;
}

/** Avvia il worker di analisi e ricalcola la curva di Starling (con debounce) quando cambiano i parametri. */
export function startAnalysis(): void {
  if (worker) return;
  worker = new Worker(new URL('../workers/analysis.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (ev: MessageEvent<AnalysisResponse>) => {
    const msg = ev.data;
    if (msg.type === 'reference') {
      useAnalysis.setState({ referenceLoop: msg.loop, referenceCurve: msg.curve });
      return;
    }
    busy = false;
    if (msg.id === requestId) useAnalysis.setState({ curve: msg.curve, computing: pending !== null });
    if (pending) {
      const p = pending;
      pending = null;
      requestCurve(p);
    }
  };
  send({ type: 'reference' });
  requestCurve(useSimulation.getState().params);
  useSimulation.subscribe((s, prev) => {
    if (s.params === prev.params) return;
    // La curva viene ricalcolata attorno alla volemia corrente con i nuovi parametri.
    clearTimeout(timer);
    timer = setTimeout(() => requestCurve(s.params), 700);
  });
}
