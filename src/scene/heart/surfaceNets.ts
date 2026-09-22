/**
 * Estrazione dell'isosuperficie d = 0 con "naive surface nets" (Gibson 1998 / Lysenko):
 * un vertice per cella attraversata (media delle intersezioni sugli spigoli), un quad per ogni spigolo
 * della griglia che attraversa la superficie. Produce mesh lisce e ben condizionate.
 */
export interface GridSpec {
  min: [number, number, number];
  max: [number, number, number];
  /** Lato della cella (cm) */
  cell: number;
}

export interface NetsResult {
  positions: Float32Array;
  indices: Uint32Array;
}

const CUBE_EDGES = [
  [0, 1],
  [2, 3],
  [4, 5],
  [6, 7],
  [0, 2],
  [1, 3],
  [4, 6],
  [5, 7],
  [0, 4],
  [1, 5],
  [2, 6],
  [3, 7],
] as const;

export function surfaceNets(sdf: (x: number, y: number, z: number) => number, g: GridSpec): NetsResult {
  const nx = Math.ceil((g.max[0] - g.min[0]) / g.cell) + 1;
  const ny = Math.ceil((g.max[1] - g.min[1]) / g.cell) + 1;
  const nz = Math.ceil((g.max[2] - g.min[2]) / g.cell) + 1;
  const field = new Float32Array(nx * ny * nz);
  const idx = (i: number, j: number, k: number) => i + nx * (j + ny * k);

  // Banda stretta: griglia grossolana (passo B celle); i blocchi lontani dalla superficie vengono
  // riempiti per interpolazione trilineare invece che valutando l'SDF (≈ 5–10× più veloce).
  const B = 4;
  const cx = Math.ceil((nx - 1) / B) + 1;
  const cy = Math.ceil((ny - 1) / B) + 1;
  const cz = Math.ceil((nz - 1) / B) + 1;
  const coarse = new Float32Array(cx * cy * cz);
  const cid = (i: number, j: number, k: number) => i + cx * (j + cy * k);
  for (let k = 0; k < cz; k++)
    for (let j = 0; j < cy; j++)
      for (let i = 0; i < cx; i++)
        coarse[cid(i, j, k)] = sdf(
          g.min[0] + i * B * g.cell,
          g.min[1] + j * B * g.cell,
          g.min[2] + k * B * g.cell,
        );
  // Con SDF ~1-lipschitziana, se un vertice del blocco dista più della diagonale del blocco,
  // la superficie non può attraversare il blocco.
  const margin = B * g.cell * Math.sqrt(3) * 1.15;
  for (let bk = 0; bk < cz - 1; bk++) {
    for (let bj = 0; bj < cy - 1; bj++) {
      for (let bi = 0; bi < cx - 1; bi++) {
        let far = false;
        const c: number[] = [];
        for (let q = 0; q < 8; q++) {
          const v = coarse[cid(bi + (q & 1), bj + ((q >> 1) & 1), bk + ((q >> 2) & 1))]!;
          c.push(v);
          if (Math.abs(v) > margin) far = true;
        }
        for (let dk = 0; dk <= B; dk++) {
          const k = bk * B + dk;
          if (k >= nz) break;
          for (let dj = 0; dj <= B; dj++) {
            const j = bj * B + dj;
            if (j >= ny) break;
            for (let di = 0; di <= B; di++) {
              const i = bi * B + di;
              if (i >= nx) break;
              if (far) {
                const u = di / B;
                const v = dj / B;
                const w = dk / B;
                field[idx(i, j, k)] =
                  (1 - w) * ((1 - v) * ((1 - u) * c[0]! + u * c[1]!) + v * ((1 - u) * c[2]! + u * c[3]!)) +
                  w * ((1 - v) * ((1 - u) * c[4]! + u * c[5]!) + v * ((1 - u) * c[6]! + u * c[7]!));
              } else {
                field[idx(i, j, k)] = sdf(
                  g.min[0] + i * g.cell,
                  g.min[1] + j * g.cell,
                  g.min[2] + k * g.cell,
                );
              }
            }
          }
        }
      }
    }
  }

  const cellVertex = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const cidx = (i: number, j: number, k: number) => i + (nx - 1) * (j + (ny - 1) * k);
  const pos: number[] = [];
  const corner = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++) {
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        let mask = 0;
        for (let c = 0; c < 8; c++) {
          const v = field[idx(i + (c & 1), j + ((c >> 1) & 1), k + ((c >> 2) & 1))]!;
          corner[c] = v;
          if (v < 0) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;
        let sx = 0;
        let sy = 0;
        let sz = 0;
        let n = 0;
        for (const [a, b] of CUBE_EDGES) {
          const da = corner[a]!;
          const db = corner[b]!;
          if (da < 0 === db < 0) continue;
          const t = da / (da - db);
          sx += (a & 1) + t * ((b & 1) - (a & 1));
          sy += ((a >> 1) & 1) + t * (((b >> 1) & 1) - ((a >> 1) & 1));
          sz += ((a >> 2) & 1) + t * (((b >> 2) & 1) - ((a >> 2) & 1));
          n++;
        }
        cellVertex[cidx(i, j, k)] = pos.length / 3;
        pos.push(
          g.min[0] + (i + sx / n) * g.cell,
          g.min[1] + (j + sy / n) * g.cell,
          g.min[2] + (k + sz / n) * g.cell,
        );
      }
    }
  }

  const tris: number[] = [];
  // Per ogni spigolo della griglia lungo x, y, z che attraversa la superficie: un quad tra le 4 celle
  for (let k = 1; k < nz - 1; k++) {
    for (let j = 1; j < ny - 1; j++) {
      for (let i = 1; i < nx - 1; i++) {
        const inside = field[idx(i, j, k)]! < 0;
        // spigolo +x
        if (i < nx - 1 && inside !== field[idx(i + 1, j, k)]! < 0) {
          quad(
            tris,
            cellVertex[cidx(i, j - 1, k - 1)]!,
            cellVertex[cidx(i, j, k - 1)]!,
            cellVertex[cidx(i, j, k)]!,
            cellVertex[cidx(i, j - 1, k)]!,
            inside,
          );
        }
        if (j < ny - 1 && inside !== field[idx(i, j + 1, k)]! < 0) {
          quad(
            tris,
            cellVertex[cidx(i - 1, j, k - 1)]!,
            cellVertex[cidx(i - 1, j, k)]!,
            cellVertex[cidx(i, j, k)]!,
            cellVertex[cidx(i, j, k - 1)]!,
            inside,
          );
        }
        if (k < nz - 1 && inside !== field[idx(i, j, k + 1)]! < 0) {
          quad(
            tris,
            cellVertex[cidx(i - 1, j - 1, k)]!,
            cellVertex[cidx(i, j - 1, k)]!,
            cellVertex[cidx(i, j, k)]!,
            cellVertex[cidx(i - 1, j, k)]!,
            inside,
          );
        }
      }
    }
  }
  return { positions: new Float32Array(pos), indices: new Uint32Array(tris) };
}

function quad(out: number[], a: number, b: number, c: number, d: number, flip: boolean): void {
  if (a < 0 || b < 0 || c < 0 || d < 0) return;
  if (flip) out.push(a, b, c, a, c, d);
  else out.push(a, c, b, a, d, c);
}
