import type { VentilationParams } from './params';
import { MMHG_PER_CMH2O } from './units';

export interface VentilationState {
  /** Pressione intratoracica (pleurica), mmHg */
  pth: number;
  /** Pressione nelle vie aeree, cmH2O */
  paw: number;
  /** Pressione alveolare, cmH2O */
  palv: number;
  /** Fase del ciclo respiratorio [0, 1) */
  phase: number;
  /** true durante l'inspirazione */
  inspiration: boolean;
}

/**
 * Pressione intratoracica in funzione del tempo.
 * - Apnea: pressione pleurica costante.
 * - Respiro spontaneo: calo sinusoidale inspiratorio della pressione pleurica.
 * - Ventilazione a pressione positiva, volume controllato a flusso costante:
 *   Palv = PEEP + V(t)/Crs; Paw = Palv + Raw·flusso; espirazione passiva con τ = Raw·Crs.
 *   Ppl = baseline + f·Palv (f = frazione trasmessa, ≈ Crs/Ccw).
 */
export function computeVentilation(t: number, p: VentilationParams, out: VentilationState): void {
  const period = 60 / Math.max(p.rr, 1);
  const s = ((t % period) + period) % period;
  const ti = period / (1 + p.ieRatio);
  out.phase = s / period;
  out.inspiration = s < ti;

  switch (p.mode) {
    case 'apnea':
      out.pth = p.pleuralBaseline;
      out.paw = 0;
      out.palv = 0;
      return;
    case 'spontaneous': {
      const drop = s < ti ? p.spontaneousSwing * Math.sin((Math.PI * s) / ti) : 0;
      out.pth = p.pleuralBaseline - drop;
      out.paw = 0;
      out.palv = 0;
      return;
    }
    case 'ppv': {
      const crs = p.compliance / 1000; // L/cmH2O
      const vt = p.tidalVolume / 1000; // L
      const raw = p.resistance; // cmH2O·s/L
      let vol: number;
      let paw: number;
      if (s < ti) {
        const flow = vt / ti;
        vol = flow * s;
        paw = p.peep + vol / crs + raw * flow;
      } else {
        const tau = Math.max(raw * crs, 0.05);
        vol = vt * Math.exp(-(s - ti) / tau);
        paw = p.peep;
      }
      const palv = p.peep + vol / crs;
      out.palv = palv;
      out.paw = paw;
      out.pth = p.pleuralBaseline + p.transmission * palv * MMHG_PER_CMH2O;
      return;
    }
  }
}
