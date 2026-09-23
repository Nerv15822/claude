/**
 * ECG sintetico (derivazione II, mV) sincronizzato con gli eventi del motore.
 * Non è un modello elettrofisiologico: è una somma di gaussiane (P, Q, R, S, T) posizionate sugli
 * eventi atriali e ventricolari dello scheduler, con QT dipendente dall'RR (Bazett) e onde f in FA.
 */
import type { Rhythm } from './params';

const g = (t: number, mu: number, sigma: number): number => {
  const x = (t - mu) / sigma;
  return Math.exp(-0.5 * x * x);
};

export interface EcgInput {
  /** Tempo assoluto (s) */
  t: number;
  /** Tempo dall'ultima onda P (s), −1 se assente */
  tP: number;
  /** Tempo dall'ultimo QRS (s), −1 se assente */
  tQRS: number;
  /** RR corrente (s) */
  rr: number;
  rhythm: Rhythm;
}

/** Durata del QT (s) secondo Bazett con QTc = 0.40 s. */
export const qtInterval = (rr: number): number => 0.4 * Math.sqrt(rr);

export function ecgValue(i: EcgInput): number {
  let v = 0;
  if (i.rhythm === 'af') {
    // Onde di fibrillazione: attività atriale caotica a bassa ampiezza (~350–450/min)
    v += 0.04 * Math.sin(2 * Math.PI * 6.3 * i.t) + 0.03 * Math.sin(2 * Math.PI * 7.9 * i.t + 1.3);
    v += 0.02 * Math.sin(2 * Math.PI * 5.1 * i.t + 2.1);
  } else if (i.tP >= 0 && i.tP < 0.25) {
    v += 0.15 * g(i.tP, 0.05, 0.022);
  }
  if (i.tQRS >= 0) {
    const q = i.tQRS;
    v += -0.1 * g(q, 0.012, 0.007);
    v += 1.2 * g(q, 0.03, 0.009);
    v += -0.28 * g(q, 0.05, 0.009);
    const qt = qtInterval(i.rr);
    const sT = 0.045 * Math.sqrt(i.rr / 0.857);
    v += 0.3 * g(q, qt - 0.08, sT);
  }
  return v;
}
