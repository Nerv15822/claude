/** Conversioni di unità. Unità interne del motore: mL, mmHg, s, mL/s. */

export const MMHG_PER_CMH2O = 0.7356;
/** 1 mmHg·s/mL = 1333.22 dyn·s·cm⁻⁵ */
export const DYN_PER_MMHG_S_ML = 1333.22;
/** Densità del sangue (kg/m³). */
export const BLOOD_DENSITY = 1060;

export const cmH2OToMmHg = (p: number): number => p * MMHG_PER_CMH2O;
export const mmHgToCmH2O = (p: number): number => p / MMHG_PER_CMH2O;

/** Resistenza: mmHg·s/mL → dyn·s·cm⁻⁵ */
export const resistanceToDyn = (r: number): number => r * DYN_PER_MMHG_S_ML;
/** Resistenza: dyn·s·cm⁻⁵ → mmHg·s/mL */
export const resistanceFromDyn = (r: number): number => r / DYN_PER_MMHG_S_ML;
/** Resistenza: mmHg·s/mL → unità Wood (mmHg·min/L) */
export const resistanceToWood = (r: number): number => (r * 1000) / 60;

/** Flusso: mL/s → L/min */
export const mlsToLmin = (q: number): number => (q * 60) / 1000;

/**
 * Coefficiente di Bernoulli per un orifizio di area efficace A (cm²):
 * ΔP[mmHg] = B·Q|Q|, con Q in mL/s.  B = ρ / (2A²), convertito.
 * Verifica: A = 1 cm², Q = 250 mL/s → v = 2.5 m/s → ΔP = 4v² ≈ 25 mmHg.
 */
export const bernoulliCoefficient = (areaCm2: number): number =>
  (BLOOD_DENSITY * 1e-4) / (2 * 133.322 * areaCm2 * areaCm2);

/**
 * Inertanza di una colonna di sangue di lunghezza l (cm) e area A (cm²):
 * L = ρ·l/A, in mmHg·s²/mL.
 */
export const inertance = (lengthCm: number, areaCm2: number): number =>
  ((BLOOD_DENSITY * 1e-4) / 133.322) * (lengthCm / areaCm2);
