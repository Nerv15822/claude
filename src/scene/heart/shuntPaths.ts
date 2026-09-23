/**
 * Percorsi delle particelle attraverso gli shunt (DIA, DIV, dotto arterioso), costruiti a runtime
 * dai percorsi anatomici del flusso: il difetto è posto nel punto di massima vicinanza tra i tratti
 * dei due circuiti (es. atrio sinistro ↔ atrio destro attraverso il setto interatriale).
 * Orientamento: dal lato sinistro (sistemico) al destro, come il segno dei flussi del motore.
 */
import type { FlowPath } from './anatomicalAsset';

/** Indici dei flussi referenziati dai percorsi: 0–7 percorsi anatomici, 8–10 shunt. */
export const SHUNT_FLOW = { asd: 8, vsd: 9, pda: 10 } as const;
/** Numero di punti dei percorsi degli shunt */
export const SHUNT_POINTS = 16;
/** Lato convenzionale dei percorsi di shunt (0 venoso, 1 arterioso) */
export const SHUNT_SIDE = 2;

const STRIDE = 16;

interface Pt {
  p: number[];
  w: number[];
  y: number;
}

/** Punti di un tratto: percorsi di un lato con coppia di flussi (q0, q1) in `stages`. */
function collect(paths: FlowPath[], side: number, stages: [number, number][], minY = -Infinity): Pt[] {
  const out: Pt[] = [];
  for (const path of paths) {
    if (path.side !== side) continue;
    const d = path.data;
    for (let o = 0; o + STRIDE <= d.length; o += STRIDE) {
      const q0 = d[o + 4]!;
      const q1 = d[o + 5]!;
      if (!stages.some(([a, b]) => a === q0 && b === q1)) continue;
      if (d[o + 1]! < minY) continue;
      out.push({ p: [d[o]!, d[o + 1]!, d[o + 2]!, d[o + 3]!], w: d.slice(o + 8, o + 16), y: d[o + 1]! });
    }
  }
  return out;
}

function closest(a: Pt[], b: Pt[]): [Pt, Pt] | null {
  let best = Infinity;
  let pair: [Pt, Pt] | null = null;
  for (const x of a)
    for (const z of b) {
      const d = (x.p[0]! - z.p[0]!) ** 2 + (x.p[1]! - z.p[1]!) ** 2 + (x.p[2]! - z.p[2]!) ** 2;
      if (d < best) {
        best = d;
        pair = [x, z];
      }
    }
  return pair;
}

function segment(a: Pt, b: Pt, radius: number, flow: number, volume: number): FlowPath {
  const data: number[] = [];
  for (let i = 0; i < SHUNT_POINTS; i++) {
    const t = i / (SHUNT_POINTS - 1);
    const lerp = (u: number, v: number) => u + (v - u) * t;
    // Restringimento al centro (il difetto) e allargamento nelle camere
    const r = radius * (0.7 + 0.6 * Math.abs(t - 0.5));
    data.push(lerp(a.p[0]!, b.p[0]!), lerp(a.p[1]!, b.p[1]!), lerp(a.p[2]!, b.p[2]!), r, flow, flow, 0, 1);
    for (let k = 0; k < 8; k++) data.push(lerp(a.w[k]!, b.w[k]!));
  }
  return { side: SHUNT_SIDE, stride: STRIDE, volume, data };
}

/**
 * Costruisce i tre percorsi di shunt. `aorticValveY` limita i punti aortici all'arco (sede del dotto).
 */
export function buildShuntPaths(paths: FlowPath[], aorticValveY: number): FlowPath[] {
  const out: FlowPath[] = [];
  const asd = closest(collect(paths, 1, [[1, 3]]), collect(paths, 0, [[0, 2]]));
  if (asd) out.push(segment(asd[0], asd[1], 0.45, SHUNT_FLOW.asd, 6));
  const vsd = closest(collect(paths, 1, [[3, 5]]), collect(paths, 0, [[2, 4]]));
  if (vsd) out.push(segment(vsd[0], vsd[1], 0.35, SHUNT_FLOW.vsd, 6));
  const pda = closest(
    collect(
      paths,
      1,
      [
        [5, 7],
        [7, 7],
      ],
      aorticValveY + 3,
    ),
    collect(paths, 0, [
      [4, 6],
      [6, 6],
    ]),
  );
  if (pda) out.push(segment(pda[0], pda[1], 0.3, SHUNT_FLOW.pda, 5));
  return out;
}
