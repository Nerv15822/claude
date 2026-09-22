/**
 * Funzioni di attivazione e(t) ∈ [0, 1] delle camere.
 *
 * Ventricoli: doppia Hill (Stergiopulos et al., Am J Physiol 1996):
 *   e(t) = k · g1/(1+g1) · 1/(1+g2),  g1 = (t/τ1)^m1,  g2 = (t/τ2)^m2
 *   τ1 = 0.269·T, τ2 = 0.452·T, m1 = 1.32, m2 = 27.4, k normalizza il massimo a 1.
 * T è una durata di attivazione che scala con √RR (relazione tipo Bazett), in modo che
 * la tachicardia accorci soprattutto la diastole, come nel cuore reale.
 *
 * Atri: impulso coseno rialzato di durata Ta, che inizia con l'onda P.
 */

const M1 = 1.32;
const M2 = 27.4;
const TAU1 = 0.269;
const TAU2 = 0.452;
/** RR di riferimento (FC 70) a cui T = RR. */
const RR_REF = 60 / 70;

function rawDoubleHill(x: number): number {
  // x = t / T
  if (x <= 0) return 0;
  const g1 = Math.pow(x / TAU1, M1);
  const g2 = Math.pow(x / TAU2, M2);
  return (g1 / (1 + g1)) * (1 / (1 + g2));
}

const NORMALIZATION = (() => {
  let max = 0;
  for (let i = 1; i <= 20000; i++) {
    const v = rawDoubleHill(i / 20000);
    if (v > max) max = v;
  }
  return 1 / max;
})();

/** Durata di attivazione ventricolare (s) in funzione dell'RR (s). */
export function ventricularActivationTime(rr: number): number {
  return Math.sqrt(RR_REF * rr);
}

/** Attivazione ventricolare a `t` secondi dall'inizio del QRS. */
export function ventricularActivation(t: number, activationTime: number): number {
  if (t <= 0) return 0;
  const x = t / activationTime;
  if (x > 1.6) return 0;
  return NORMALIZATION * rawDoubleHill(x);
}

/** Durata della contrazione atriale (s). */
export function atrialActivationTime(rr: number): number {
  return 0.2 * Math.sqrt(rr / RR_REF);
}

/** Attivazione atriale a `t` secondi dall'inizio dell'onda P. */
export function atrialActivation(t: number, duration: number): number {
  if (t <= 0 || t >= duration) return 0;
  return 0.5 * (1 - Math.cos((2 * Math.PI * t) / duration));
}
