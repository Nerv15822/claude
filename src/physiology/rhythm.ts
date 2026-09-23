import {
  atrialActivation,
  atrialActivationTime,
  ventricularActivation,
  ventricularActivationTime,
} from './activation';
import type { RhythmParams } from './params';

/** PRNG deterministico (mulberry32) — i test devono essere riproducibili. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Scheduler del ritmo: genera separatamente gli eventi atriali (onda P) e ventricolari (QRS).
 * - sinusale: QRS = P + PR
 * - FA: nessuna contrazione atriale efficace, RR ventricolare irregolare
 * - BAV III: atri alla frequenza sinusale, ventricoli al ritmo di scappamento, dissociati
 * Per continuità di e(t) in tachicardia si tiene conto anche del battito precedente.
 */
export class RhythmScheduler {
  lastP = -Infinity;
  nextP = 0;
  lastQRS = -Infinity;
  prevQRS = -Infinity;
  nextQRS = Infinity;
  /** RR ventricolare corrente (s) usato per la durata dell'attivazione */
  currentRR = 60 / 70;
  prevRR = 60 / 70;
  atrialRR = 60 / 70;
  /** true nello step in cui è avvenuto un nuovo QRS */
  qrsFired = false;
  pFired = false;
  private readonly rand: () => number;

  constructor(seed = 1) {
    this.rand = mulberry32(seed);
  }

  private gaussian(): number {
    const u = Math.max(this.rand(), 1e-12);
    const v = this.rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /** Aggiorna gli eventi fino al tempo t. */
  update(t: number, p: RhythmParams): void {
    this.qrsFired = false;
    this.pFired = false;
    const sinusRR = 60 / Math.max(p.hr, 10);

    if (p.rhythm !== 'af') {
      if (t >= this.nextP) {
        this.lastP = this.nextP;
        this.atrialRR = sinusRR;
        this.nextP = this.lastP + sinusRR;
        this.pFired = true;
        if (p.rhythm === 'sinus') this.nextQRS = this.lastP + p.pr;
      }
    } else {
      this.nextP = Infinity;
      this.lastP = -Infinity;
    }

    if (p.rhythm === 'af' && !Number.isFinite(this.nextQRS)) this.nextQRS = t;
    if (p.rhythm === 'avb3' && !Number.isFinite(this.nextQRS)) this.nextQRS = t + p.pr;

    if (t >= this.nextQRS) {
      this.prevQRS = this.lastQRS;
      this.lastQRS = this.nextQRS;
      this.prevRR = this.currentRR;
      this.qrsFired = true;
      if (p.rhythm === 'sinus') {
        this.currentRR = sinusRR;
        this.nextQRS = Infinity; // attende la prossima P
      } else if (p.rhythm === 'af') {
        const meanRR = sinusRR;
        let next = meanRR * (1 + p.afVariability * this.gaussian());
        next = Math.min(Math.max(next, 0.45 * meanRR, 0.28), 2.2 * meanRR);
        this.currentRR = next;
        this.nextQRS = this.lastQRS + next;
      } else {
        const esc = 60 / Math.max(p.escapeRate, 10);
        this.currentRR = esc;
        this.nextQRS = this.lastQRS + esc;
      }
    }
  }

  /** Attivazione ventricolare al tempo t. */
  ventricular(t: number): number {
    const a = ventricularActivation(t - this.lastQRS, ventricularActivationTime(this.currentRR));
    if (!Number.isFinite(this.prevQRS)) return a;
    const b = ventricularActivation(t - this.prevQRS, ventricularActivationTime(this.prevRR));
    return a > b ? a : b;
  }

  /** Attivazione atriale al tempo t (0 in FA). */
  atrial(t: number, p: RhythmParams): number {
    if (p.rhythm === 'af') return 0;
    return atrialActivation(t - this.lastP, atrialActivationTime(this.atrialRR));
  }
}
