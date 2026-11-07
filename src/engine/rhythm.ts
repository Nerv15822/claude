/**
 * Emodinamica — scheduler del ritmo: genera gli istanti di onda P (sistole atriale) e di
 * QRS (sistole ventricolare) e, da questi, le attivazioni e(t) di atri e ventricoli.
 *
 *  - Sinusale: l'atrio è il pacemaker; il QRS segue ogni P dopo l'intervallo PR. RR = 60/FC.
 *  - FA: RR ventricolare irregolare (variabilità deterministica), nessuna sistole atriale (eA = 0).
 *  - BAV III: dissociazione AV — atri a frequenza sinusale, ventricoli a frequenza di scappamento.
 */
import {
  atrialActivation,
  atrialActivationTime,
  ventricularActivation,
  ventricularActivationTime,
} from './activation';
import type { RhythmParams } from './params';

/** Generatore pseudocasuale deterministico (LCG) per la variabilità dell'RR in FA. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export interface Activation {
  eV: number;
  eA: number;
}

export class RhythmScheduler {
  private tA: number; // istante dell'ultima onda P (s)
  private tV: number; // istante dell'ultimo QRS (s)
  private rrV: number; // RR del battito ventricolare corrente (durata di attivazione)
  private rng: () => number;

  constructor(
    private p: RhythmParams,
    seed = 12345,
  ) {
    this.rng = lcg(seed);
    const rr = 60 / Math.max(p.hr, 1);
    this.rrV = rr;
    // Primo QRS a t = 0, prima P un PR prima (così l'avvio è già sincronizzato).
    this.tA = -p.pr;
    this.tV = 0;
  }

  setParams(p: RhythmParams): void {
    this.p = p;
  }

  /** RR del battito ventricolare corrente (s). */
  get rr(): number {
    return this.rrV;
  }

  /** Istante dell'ultimo QRS (s). */
  get lastQrs(): number {
    return this.tV;
  }

  private nextAfInterval(): number {
    const mean = 60 / Math.max(this.p.hr, 1);
    const u = this.rng();
    return mean * (1 + this.p.afVariability * (u - 0.5) * 2);
  }

  /** Avanza lo scheduler fino al tempo t, aggiorna le tempistiche e segnala QRS / onda P. */
  advance(t: number): { qrs: boolean; pWave: boolean } {
    const p = this.p;
    let qrs = false;
    let pWave = false;

    if (p.rhythm === 'sinus') {
      const rrA = 60 / Math.max(p.hr, 1);
      // L'atrio è il pacemaker; ogni P programma un QRS PR secondi dopo.
      while (t >= this.tA + rrA) {
        this.tA += rrA;
        pWave = true;
      }
      const scheduledV = this.tA + p.pr;
      if (t >= scheduledV && scheduledV > this.tV) {
        this.tV = scheduledV;
        this.rrV = rrA;
        qrs = true;
      }
    } else if (p.rhythm === 'avb3') {
      const rrA = 60 / Math.max(p.hr, 1);
      const rrEsc = 60 / Math.max(p.escapeRate, 1);
      while (t >= this.tA + rrA) {
        this.tA += rrA;
        pWave = true;
      }
      while (t >= this.tV + rrEsc) {
        this.tV += rrEsc;
        this.rrV = rrEsc;
        qrs = true;
      }
    } else {
      // FA
      while (t >= this.tV + this.rrV) {
        this.tV += this.rrV;
        this.rrV = this.nextAfInterval();
        qrs = true;
      }
    }
    return { qrs, pWave };
  }

  /** Attivazioni e(t) al tempo t usando le tempistiche correnti (nessuna mutazione). */
  activationAt(t: number): Activation {
    const p = this.p;
    const eV = ventricularActivation(t - this.tV, ventricularActivationTime(this.rrV));
    let eA = 0;
    if (p.rhythm !== 'af') {
      const rrA = 60 / Math.max(p.hr, 1);
      eA = atrialActivation(t - this.tA, atrialActivationTime(rrA));
    }
    return { eV, eA };
  }
}
