/// <reference lib="webworker" />
/**
 * Worker per le analisi offline (curva di Frank-Starling, loop di riferimento): non blocca né il
 * rendering né il motore in tempo reale.
 */
import { computeReferenceLoop, computeStarlingCurve } from '../physiology/analysis';
import { defaultParams } from '../physiology/params';
import type { AnalysisRequest, AnalysisResponse } from './protocol';

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (ev: MessageEvent<AnalysisRequest>) => {
  const msg = ev.data;
  if (msg.type === 'reference') {
    const p = defaultParams();
    const loop = computeReferenceLoop(p);
    const curve = computeStarlingCurve(p);
    const res: AnalysisResponse = { type: 'reference', loop, curve };
    ctx.postMessage(res, [loop.lv.buffer, loop.rv.buffer]);
  } else {
    const curve = computeStarlingCurve(msg.params);
    const res: AnalysisResponse = { type: 'starling', id: msg.id, curve };
    ctx.postMessage(res);
  }
};
