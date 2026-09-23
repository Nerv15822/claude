import { F } from '@physiology/engine';
import type { Params } from '@physiology/params';
import { sampleBuffer as defaultBuffer, type SampleBuffer } from '@store/sampleBuffer';

/** Valvole: 0 mitrale, 1 aortica, 2 tricuspide, 3 polmonare. */
const FLOW_FIELDS = [F.qMV, F.qAV, F.qTV, F.qPV];
/** Flusso (mL/s) a cui il lembo è completamente aperto */
const Q_FULL = [140, 180, 150, 170];
/**
 * Elevazione fisiologica del lembo rispetto al piano dell'anulus (rad, positiva verso valle):
 * chiuso ≈ 10° (coaptazione, lieve concavità), aperto ≈ 70–75° (parallelo al flusso).
 */
export const CLOSED_ELEVATION = [0.17, 0.12, 0.17, 0.12];
export const OPEN_ELEVATION = [1.2, 1.3, 1.2, 1.3];
const NORMAL_AREA = [4.5, 4.0, 6.0, 3.5];

const smooth = (x: number) => {
  const t = Math.min(Math.max(x, 0), 1);
  return t * t * (3 - 2 * t);
};

/**
 * Apertura dei lembi guidata dal flusso transvalvolare del motore, con piccola inerzia (τ ~20–30 ms).
 * Stenosi: apertura massima ridotta (∝ √(area/area normale)). Insufficienza: coaptazione incompleta
 * (apertura residua ∝ √EROA) quando la valvola è chiusa.
 */
export class ValveDynamics {
  readonly open = [0, 0, 0, 0];

  constructor(private readonly buffer: SampleBuffer = defaultBuffer) {}

  update(dt: number, p: Params): void {
    const valves = [p.mitral, p.aortic, p.tricuspid, p.pulmonic];
    for (let v = 0; v < 4; v++) {
      const q = this.buffer.latest(FLOW_FIELDS[v]!);
      const cfg = valves[v]!;
      const maxOpen = Math.min(1, Math.max(0.12, Math.sqrt(cfg.area / NORMAL_AREA[v]!)));
      const gap = Math.min(0.35, Math.sqrt(Math.max(cfg.regurgitantArea, 0)) * 0.35);
      const target = q > 0 ? Math.max(gap, smooth(q / Q_FULL[v]!) * maxOpen) : gap;
      const tau = target > this.open[v]! ? 0.018 : 0.03;
      this.open[v] = this.open[v]! + (target - this.open[v]!) * (dt > 0 ? 1 - Math.exp(-dt / tau) : 0);
    }
  }

  /**
   * Rotazione (rad) da applicare a un lembo rispetto alla posa del modello, nota la sua elevazione
   * di riposo misurata dalla pipeline anatomica.
   */
  angle(v: number, restElevation: number): number {
    const o = this.open[v]!;
    // Semilunari: il modello è in posa chiusa (cuspidi coaptate), usata come riferimento di chiusura
    const closed = v === 1 || v === 3 ? restElevation : CLOSED_ELEVATION[v]!;
    return closed + o * (OPEN_ELEVATION[v]! - closed) - restElevation;
  }
}
