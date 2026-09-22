import { SAMPLE_SIZE } from '../physiology/engine';

/**
 * Buffer circolare dei campioni (non reattivo: letto dai tracciati nel loop di rendering).
 * 250 Hz × 12 s.
 */
export const SAMPLE_RATE = 250;
export const CAPACITY = SAMPLE_RATE * 12;

export const sampleBuffer = {
  data: new Float32Array(CAPACITY * SAMPLE_SIZE),
  /** Indice (assoluto, crescente) del prossimo campione */
  head: 0,
  push(src: Float32Array, count: number): void {
    for (let i = 0; i < count; i++) {
      const slot = (this.head % CAPACITY) * SAMPLE_SIZE;
      this.data.set(src.subarray(i * SAMPLE_SIZE, (i + 1) * SAMPLE_SIZE), slot);
      this.head++;
    }
  },
  /** Valore del campo `field` del campione `index` (assoluto). */
  get(index: number, field: number): number {
    return this.data[(index % CAPACITY) * SAMPLE_SIZE + field]!;
  },
  latest(field: number): number {
    return this.head > 0 ? this.get(this.head - 1, field) : 0;
  },
  clear(): void {
    this.head = 0;
  },
};
