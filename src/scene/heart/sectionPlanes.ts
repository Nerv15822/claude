import { Plane, Vector3 } from 'three';
import type { SectionPlane } from '../viewStore';

export interface SectionFrame {
  longAxis: readonly number[];
  lvApex: readonly number[];
  mitralCenter: readonly number[];
  valveCenters: readonly (readonly number[])[];
}

const v = (a: readonly number[]) => new Vector3(a[0], a[1], a[2]);

/**
 * Piani di sezione anatomici (convenzione three.js: viene conservato il semispazio con
 * normale·p + costante ≥ 0; la normale punta verso la parte visibile, cioè lontano dall'osservatore).
 * - Quattro camere: contiene l'asse lungo e i centri di mitrale e tricuspide; si rimuove la metà anteriore.
 * - Asse lungo parasternale: contiene l'asse lungo, la mitrale e la valvola aortica.
 * - Asse corto: perpendicolare all'asse lungo a livello medio-ventricolare (muscoli papillari).
 */
export function sectionPlane(f: SectionFrame, kind: SectionPlane, offset: number, out: Plane): Plane {
  const axis = v(f.longAxis).normalize();
  const mv = v(f.valveCenters[0]!);
  const av = v(f.valveCenters[1]!);
  const tv = v(f.valveCenters[2]!);
  let n: Vector3;
  let p: Vector3;
  if (kind === 'asseCorto') {
    n = axis.clone().negate(); // si conserva la parte apicale, vista dalla base
    p = mv.clone().lerp(v(f.lvApex), 0.5 + 0.35 * offset);
  } else {
    const inPlane = kind === 'quattroCamere' ? tv.clone().sub(mv) : av.clone().sub(mv);
    n = new Vector3().crossVectors(axis, inPlane).normalize();
    // La metà rimossa è quella anteriore (+z): la normale deve puntare posteriormente
    if (n.z > 0) n.negate();
    const c = kind === 'quattroCamere' ? mv.clone().lerp(tv, 0.5) : mv.clone().lerp(av, 0.5);
    p = c.addScaledVector(n, -2.5 * offset);
  }
  return out.setFromNormalAndCoplanarPoint(n, p);
}
