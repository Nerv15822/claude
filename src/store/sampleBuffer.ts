import { SAMPLE_SIZE } from '../physiology/engine';

/**
 * Buffer circolare dei campioni (non reattivo: letto dai tracciati e dalla scena nel loop di rendering).
 * 250 Hz × 12 s.
 */
export const SAMPLE_RATE = 250;
export const CAPACITY = SAMPLE_RATE * 12;

export interface SampleBuffer {
  data: Float32Array;
  /** Indice (assoluto, crescente) del prossimo campione */
  head: number;
  push(src: Float32Array, count: number, offset?: number): void;
  /** Valore del campo `field` del campione `index` (assoluto). */
  get(index: number, field: number): number;
  latest(field: number): number;
  clear(): void;
}

export function createSampleBuffer(): SampleBuffer {
  return {
    data: new Float32Array(CAPACITY * SAMPLE_SIZE),
    head: 0,
    push(src, count, offset = 0) {
      for (let i = 0; i < count; i++) {
        const slot = (this.head % CAPACITY) * SAMPLE_SIZE;
        const o = offset + i * SAMPLE_SIZE;
        this.data.set(src.subarray(o, o + SAMPLE_SIZE), slot);
        this.head++;
      }
    },
    get(index, field) {
      return this.data[(index % CAPACITY) * SAMPLE_SIZE + field]!;
    },
    latest(field) {
      return this.head > 0 ? this.get(this.head - 1, field) : 0;
    },
    clear() {
      this.head = 0;
    },
  };
}

/** Campioni del paziente (caso corrente). */
export const sampleBuffer = createSampleBuffer();
/** Campioni del cuore normale di riferimento (modalità confronto). */
export const refSampleBuffer = createSampleBuffer();
