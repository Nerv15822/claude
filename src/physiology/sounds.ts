/**
 * Fonocardiogramma schematico.
 * I toni sono "burst" oscillanti smorzati generati dagli eventi del modello:
 * - S1: chiusura mitralica (M1) e tricuspidale (T1); ampiezza ∝ dP/dt del VS alla chiusura
 * - S2: chiusura aortica (A2) e polmonare (P2); ampiezza ∝ pressione a valle.
 *   Lo sdoppiamento fisiologico inspiratorio emerge spontaneamente dal modello.
 * - S3: al picco del riempimento rapido, presente solo con pressione atriale sinistra elevata
 * - S4: alla contrazione atriale contro un ventricolo rigido (PTD elevata), assente in FA
 * - Soffi: rumore proporzionale alla velocità del getto oltre 2 m/s (stenosi, rigurgiti, shunt)
 * Le soglie per S3/S4 sono euristiche didattiche, non un modello acustico.
 */
import { mulberry32 } from './rhythm';

const MAX_BURSTS = 8;

export class PhonoGenerator {
  private readonly start = new Float64Array(MAX_BURSTS).fill(-Infinity);
  private readonly amp = new Float64Array(MAX_BURSTS);
  private readonly freq = new Float64Array(MAX_BURSTS);
  private readonly decay = new Float64Array(MAX_BURSTS);
  private next = 0;
  private readonly rand = mulberry32(7);
  /** Ampiezza corrente del soffio (0–1) */
  murmur = 0;

  /** Programma un tono che inizia al tempo t0. */
  burst(t0: number, amplitude: number, frequency: number, decay: number): void {
    if (amplitude <= 0.01) return;
    const k = this.next;
    this.start[k] = t0;
    this.amp[k] = amplitude;
    this.freq[k] = frequency;
    this.decay[k] = decay;
    this.next = (k + 1) % MAX_BURSTS;
  }

  value(t: number): number {
    let v = 0;
    for (let k = 0; k < MAX_BURSTS; k++) {
      const dt = t - this.start[k]!;
      if (dt < 0 || dt > 0.12) continue;
      const env = Math.sin(Math.min(dt / 0.006, 1) * (Math.PI / 2)) * Math.exp(-dt / this.decay[k]!);
      v += this.amp[k]! * env * Math.sin(2 * Math.PI * this.freq[k]! * dt);
    }
    if (this.murmur > 0) v += this.murmur * (this.rand() * 2 - 1);
    return v;
  }
}

/** Velocità (cm/s) del getto attraverso un orifizio: Q (mL/s) / A (cm²). */
export const jetVelocity = (q: number, area: number): number => (area > 1e-4 ? Math.abs(q) / area : 0);

/** Contributo al soffio di un getto: 0 sotto 2 m/s, saturazione a 5 m/s. */
export const murmurFromVelocity = (v: number): number => Math.min(Math.max((v - 200) / 300, 0), 1);
