/**
 * Posizione del setto interventricolare ricavata dalla geometria delle cavità: nella fetta a metà
 * ventricolo si cerca lo spazio tra la faccia settale dell'endocardio del VS e quella del VD lungo la
 * direzione VS→VD. Il centro del setto è a metà di questo spazio (superficie media del setto).
 */
export const CAVITY_CODE = { lv: 5, rv: 6 } as const;

export interface SeptumFrame {
  center: [number, number, number];
  dir: [number, number, number];
  /** Spessore stimato del setto (cm) */
  thickness: number;
}

const dot = (a: readonly number[], b: readonly number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;

/**
 * @param positions posizioni dei vertici (x, y, z)
 * @param codes codice di superficie per vertice (5 = cavità VS, 6 = cavità VD)
 */
export function septumFrame(
  positions: ArrayLike<number>,
  codes: ArrayLike<number>,
  lvApex: readonly number[],
  longAxis: readonly number[],
  baseApexLength: number,
  roughDir: readonly number[],
): SeptumFrame {
  const ax = longAxis;
  let dir = [roughDir[0]!, roughDir[1]!, roughDir[2]!];
  const d = dot(dir, ax);
  dir = dir.map((x, i) => x - d * ax[i]!);
  const l = Math.hypot(dir[0]!, dir[1]!, dir[2]!) || 1;
  dir = dir.map((x) => x / l);
  const mid = [0, 1, 2].map((i) => lvApex[i]! - 0.5 * baseApexLength * ax[i]!);
  let lvMax = -Infinity;
  let rvMin = Infinity;
  const n = codes.length;
  for (let i = 0; i < n; i++) {
    const c = codes[i]!;
    if (c !== CAVITY_CODE.lv && c !== CAVITY_CODE.rv) continue;
    const q = [positions[i * 3]! - mid[0]!, positions[i * 3 + 1]! - mid[1]!, positions[i * 3 + 2]! - mid[2]!];
    const a = dot(q, ax);
    if (Math.abs(a) > 0.8) continue;
    const r = q.map((x, k) => x - a * ax[k]!);
    const s = dot(r, dir);
    const lat = Math.hypot(r[0]! - s * dir[0]!, r[1]! - s * dir[1]!, r[2]! - s * dir[2]!);
    if (lat > 1.0) continue;
    if (c === CAVITY_CODE.lv && s > lvMax) lvMax = s;
    if (c === CAVITY_CODE.rv && s < rvMin && s > 0) rvMin = s;
  }
  // Senza dati sufficienti: setto a ~2 cm dall'asse del VS
  const ok = Number.isFinite(lvMax) && Number.isFinite(rvMin) && rvMin > lvMax;
  const s = ok ? (lvMax + rvMin) / 2 : 2;
  return {
    center: [mid[0]! + s * dir[0]!, mid[1]! + s * dir[1]!, mid[2]! + s * dir[2]!],
    dir: [dir[0]!, dir[1]!, dir[2]!],
    thickness: ok ? rvMin - lvMax : 1,
  };
}
