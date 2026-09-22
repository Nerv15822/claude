/// <reference lib="webworker" />
/** Genera la mesh procedurale del cuore fuori dal main thread. */
import { buildHeartGeometry } from '../scene/heart/heartGeometry';

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (ev: MessageEvent<{ cell: number }>) => {
  const g = buildHeartGeometry(ev.data.cell);
  ctx.postMessage(g, [
    g.position.buffer,
    g.normal.buffer,
    g.color.buffer,
    g.aChamber.buffer,
    g.aVessel.buffer,
    g.aAxis.buffer,
    g.index.buffer,
  ]);
};
