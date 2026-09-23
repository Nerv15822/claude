/** Convenzioni di denominazione delle mesh del modello GLB esterno. */
export const GLB_URL = `${import.meta.env.BASE_URL}models/heart.glb`;

export type Part = 'lv' | 'rv' | 'la' | 'ra' | 'aorta' | 'pa' | 'other';

/** Riconoscimento delle mesh per nome (vedi README: convenzioni di denominazione). */
export function classifyMesh(name: string): Part {
  const n = name.toLowerCase();
  if (/coronar|valve|valvola/.test(n)) return 'other';
  if (/(^|[_\s.-])(lv|left_?ventricle|ventricolo_?sinistro)([_\s.-]|\d|$)/.test(n)) return 'lv';
  if (/(^|[_\s.-])(rv|right_?ventricle|ventricolo_?destro)([_\s.-]|\d|$)/.test(n)) return 'rv';
  if (/(^|[_\s.-])(la|left_?atrium|atrio_?sinistro)([_\s.-]|\d|$)/.test(n)) return 'la';
  if (/(^|[_\s.-])(ra|right_?atrium|atrio_?destro)([_\s.-]|\d|$)/.test(n)) return 'ra';
  if (/aort/.test(n)) return 'aorta';
  if (/pulmonary_?(artery|trunk)|(^|_)pa(_|$)|arteria_?polmonare/.test(n)) return 'pa';
  return 'other';
}
