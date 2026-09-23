import { create } from 'zustand';

export type ViewPreset = 'anteriore' | 'posteriore' | 'sinistra' | 'apice' | 'base' | 'sezione';
export type Quality = 'alta' | 'media' | 'bassa';
/** Modalità di visualizzazione del cuore */
export type ViewMode = 'esterna' | 'sezione' | 'raggiX' | 'pressione' | 'attivazione';
/** Piani di sezione ecocardiografici */
export type SectionPlane = 'quattroCamere' | 'asseLungo' | 'asseCorto';
export type ParticleColor = 'saturazione' | 'doppler';

interface ViewState {
  preset: ViewPreset;
  /** Incrementato per ripetere la stessa vista */
  nonce: number;
  quality: Quality;
  mode: ViewMode;
  section: SectionPlane;
  /** Spostamento del piano lungo la sua normale (−1…1) */
  sectionOffset: number;
  particles: boolean;
  particleColor: ParticleColor;
  /** Etichetta anatomica selezionata con doppio tap */
  label: { text: string; x: number; y: number; z: number } | null;
  /** Direzione di osservazione della sezione (dal lato rimosso verso il piano) */
  sectionView: { dir: [number, number, number]; center: [number, number, number] } | null;
  setPreset: (p: ViewPreset) => void;
  setQuality: (q: Quality) => void;
  setMode: (m: ViewMode) => void;
  setSection: (s: SectionPlane) => void;
  setSectionOffset: (o: number) => void;
  setParticles: (v: boolean) => void;
  setParticleColor: (c: ParticleColor) => void;
  setLabel: (l: ViewState['label']) => void;
}

export const useView = create<ViewState>((set) => ({
  preset: 'anteriore',
  nonce: 0,
  quality: 'media',
  mode: 'esterna',
  section: 'quattroCamere',
  sectionOffset: 0,
  particles: true,
  particleColor: 'saturazione',
  label: null,
  sectionView: null,
  setPreset: (preset) => set((s) => ({ preset, nonce: s.nonce + 1 })),
  setQuality: (quality) => set({ quality }),
  setMode: (mode) =>
    set((s) => ({ mode, ...(mode === 'sezione' ? { preset: 'sezione' as const, nonce: s.nonce + 1 } : {}) })),
  setSection: (section) => set((s) => ({ section, preset: 'sezione', nonce: s.nonce + 1 })),
  setSectionOffset: (sectionOffset) => set({ sectionOffset }),
  setParticles: (particles) => set({ particles }),
  setParticleColor: (particleColor) => set({ particleColor }),
  setLabel: (label) => set({ label }),
}));
