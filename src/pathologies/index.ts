import { applyPatch, defaultParams, type Params } from '@physiology/params';
import { ARITMIE } from './arrhythmias';
import { MIOCARDICHE } from './myocardial';
import { PERICARDICHE } from './pericardial';
import { POLMONARI } from './pulmonary';
import { SHOCK } from './shock';
import { SHUNT } from './shunts';
import { MORFOLOGIA_NORMALE, type Morfologia, type Pathology } from './types';
import { VALVOLARI } from './valvular';

export * from './types';

export const PATHOLOGIES: Pathology[] = [
  ...VALVOLARI,
  ...MIOCARDICHE,
  ...PERICARDICHE,
  ...POLMONARI,
  ...SHOCK,
  ...SHUNT,
  ...ARITMIE,
];

export const PATHOLOGY_BY_ID: Record<string, Pathology> = Object.fromEntries(
  PATHOLOGIES.map((p) => [p.id, p]),
);

/** Parametri completi di un caso: normale + patologia alla gravità s. */
export function caseParams(p: Pathology | null, s: number): Params {
  const params = defaultParams();
  if (p) applyPatch(params, p.params(s));
  return params;
}

export function caseMorphology(p: Pathology | null, s: number): Morfologia {
  return { ...MORFOLOGIA_NORMALE, ...(p?.morfologia?.(s) ?? {}) };
}
