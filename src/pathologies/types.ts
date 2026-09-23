import type { ParamsPatch } from '@physiology/params';

export type Categoria =
  'valvolari' | 'miocardiche' | 'pericardiche' | 'polmonari' | 'shock' | 'shunt' | 'aritmie';

export const CATEGORIE: Record<Categoria, string> = {
  valvolari: 'Valvulopatie',
  miocardiche: 'Miocardio',
  pericardiche: 'Pericardio',
  polmonari: 'Circolo polmonare',
  shock: 'Shock',
  shunt: 'Shunt',
  aritmie: 'Aritmie',
};

/** Morfologia per la scena 3D: fattori di spessore di parete (1 = normale). */
export interface Morfologia {
  lvWall: number;
  rvWall: number;
}

export const MORFOLOGIA_NORMALE: Morfologia = { lvWall: 1, rvWall: 1 };

/** Obiettivo emodinamico per la gestione anestesiologica. */
export interface Obiettivo {
  /** Obiettivo sintetico (es. "Bassa-normale, 60–80 bpm") */
  target: string;
  fare: string;
  evitare: string;
}

export interface Scheda {
  fisiopatologia: string;
  /** Emodinamica attesa (valori/segni che il simulatore riproduce) */
  emodinamica: string[];
  eco: string[];
  obiettivi: {
    fc: Obiettivo;
    precarico: Obiettivo;
    postcarico: Obiettivo;
    contrattilita: Obiettivo;
  };
  /** Messaggio chiave da portare a casa */
  chiave: string;
  /** Cosa provare nel simulatore */
  prova?: string[];
}

export interface Pathology {
  id: string;
  nome: string;
  categoria: Categoria;
  /** Descrizione della gravità corrente (es. "AVA 0.8 cm²") */
  gravita: (s: number) => string;
  /** Parametri alla gravità s ∈ [0, 1] (0 = lieve, 1 = grave), valori assoluti rispetto al normale */
  params: (s: number) => ParamsPatch;
  morfologia?: (s: number) => Partial<Morfologia>;
  scheda: Scheda;
}

export const lerp = (a: number, b: number, s: number) => a + (b - a) * s;
/** Interpolazione geometrica (per resistenze e aree: variazioni percepite in modo proporzionale) */
export const glerp = (a: number, b: number, s: number) => a * Math.pow(b / a, s);
