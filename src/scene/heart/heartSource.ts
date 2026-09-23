/**
 * Sorgente dei dati di un cuore nella scena: il paziente (caso corrente) o il cuore normale di
 * riferimento (modalità confronto). La scena legge solo campioni e metriche del motore.
 */
import { defaultParams, type Params } from '@physiology/params';
import { refSampleBuffer, sampleBuffer, type SampleBuffer } from '@store/sampleBuffer';
import { useSimulation } from '@store/simulation';
import type { Morphology } from './deformation';

export interface HeartSource {
  id: 'paziente' | 'normale';
  buffer: SampleBuffer;
  params: () => Params;
  morphology: () => Morphology;
  svo2: () => number | null;
}

export const patientSource: HeartSource = {
  id: 'paziente',
  buffer: sampleBuffer,
  params: () => useSimulation.getState().params,
  morphology: () => useSimulation.getState().morphology,
  svo2: () => useSimulation.getState().beat?.svo2 ?? null,
};

const NORMAL_PARAMS = defaultParams();
const NORMAL_MORPHOLOGY: Morphology = { lvWall: 1, rvWall: 1 };

export const normalSource: HeartSource = {
  id: 'normale',
  buffer: refSampleBuffer,
  params: () => NORMAL_PARAMS,
  morphology: () => NORMAL_MORPHOLOGY,
  svo2: () => useSimulation.getState().refBeat?.svo2 ?? null,
};
