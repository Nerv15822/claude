import type { BufferGeometry } from 'three';
import type { ViewMode } from '../viewStore';

const REGIONS = [
  'Ventricolo sinistro',
  'Ventricolo destro',
  'Atrio sinistro',
  'Atrio destro',
  'Aorta',
  'Arteria polmonare',
  'Vena cava',
  'Vena polmonare',
];
const KINDS: Record<number, string> = {
  3: 'Arteria coronaria',
  4: 'Vena cardiaca',
  5: 'Endocardio del ventricolo sinistro',
  6: 'Endocardio del ventricolo destro',
  7: "Endocardio dell'atrio sinistro",
  8: "Endocardio dell'atrio destro",
  9: 'Muscolo papillare',
  10: 'Valvola mitrale',
  11: 'Valvola aortica',
  12: 'Valvola tricuspide',
  13: 'Valvola polmonare',
};

/** Etichetta anatomica per il vertice selezionato (dai pesi di regione e dal tipo di superficie). */
export function labelFor(g: BufferGeometry, vertex: number, _mode: ViewMode): string | null {
  if (vertex < 0) return null;
  const surf = g.getAttribute('aSurface');
  const ch = g.getAttribute('aChamber');
  const ve = g.getAttribute('aVessel');
  if (!surf || !ch || !ve) return null;
  const kind = Math.round(surf.getY(vertex));
  if (KINDS[kind]) return KINDS[kind];
  const w = [
    ch.getX(vertex),
    ch.getY(vertex),
    ch.getZ(vertex),
    ch.getW(vertex),
    ve.getX(vertex),
    ve.getY(vertex),
    ve.getZ(vertex),
    ve.getW(vertex),
  ];
  let best = 0;
  for (let i = 1; i < 8; i++) if (w[i]! > w[best]!) best = i;
  const fat = surf.getX(vertex);
  const base = REGIONS[best]!;
  return fat > 0.5 ? `${base} — grasso epicardico` : base;
}
