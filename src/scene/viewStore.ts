import { create } from 'zustand';

export type ViewPreset = 'anteriore' | 'posteriore' | 'sinistra' | 'apice' | 'base';
export type Quality = 'alta' | 'media' | 'bassa';

interface ViewState {
  preset: ViewPreset;
  /** Incrementato per ripetere la stessa vista */
  nonce: number;
  quality: Quality;
  setPreset: (p: ViewPreset) => void;
  setQuality: (q: Quality) => void;
}

export const useView = create<ViewState>((set) => ({
  preset: 'anteriore',
  nonce: 0,
  quality: 'media',
  setPreset: (preset) => set((s) => ({ preset, nonce: s.nonce + 1 })),
  setQuality: (quality) => set({ quality }),
}));
