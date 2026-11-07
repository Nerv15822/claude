/**
 * Emodinamica — i sei distretti di resistenza sistemica in parallelo.
 *
 * La resistenza sistemica totale è scomposta in sei letti in parallelo, ciascuno con la
 * propria resistenza, il proprio flusso e la propria frazione di gittata. Due letti —
 * coronarico e cerebrale — hanno autoregolazione: entro una finestra di pressione di
 * perfusione il flusso resta pressoché costante perché la conduttanza si adatta.
 *
 * Il flusso di ciascun distretto è  q_i = g_i · (P_art − P_ven),  con g_i (mL/s/mmHg)
 * conduttanza del distretto. g_i = gBase_i · tone_i · autoreg_i, dove:
 *   - gBase_i = frazione_i / R_sys è la conduttanza a riposo;
 *   - tone_i è il moltiplicatore imposto da farmaci / riflesso / metabolismo (1 = riposo);
 *   - autoreg_i vale 1 tranne per i letti autoregolati, dove adatta la conduttanza.
 *
 * NB: i distretti sono puramente resistivi (nessuno stato dedicato): le frazioni di
 * gittata e i flussi emergono dall'integrazione dei compartimenti arterioso e venoso.
 */

export const DISTRICT_KEYS = ['splanchnic', 'renal', 'muscle', 'skin', 'coronary', 'cerebral'] as const;

export type DistrictKey = (typeof DISTRICT_KEYS)[number];
export const DISTRICT_COUNT = DISTRICT_KEYS.length;

export interface DistrictParams {
  key: DistrictKey;
  nome: string;
  /** Frazione della gittata a riposo (le sei frazioni sommano a 1). */
  fraction: number;
  /** Letto con autoregolazione del flusso (coronarico, cerebrale). */
  autoregulated: boolean;
  /**
   * Limiti della conduttanza, come multipli di gBase, per i letti autoregolati.
   * La finestra di pressione in cui il flusso resta costante EMERGE da questi limiti:
   *   P_low  ≈ P_rif / gMaxFrac   (sotto: vasodilatazione massima, il flusso cala)
   *   P_high ≈ P_rif / gMinFrac   (sopra: vasocostrizione massima, il flusso aumenta)
   */
  gMinFrac: number;
  gMaxFrac: number;
}

/**
 * Distribuzione a riposo della gittata (adulto sano, supino). Le frazioni dei letti
 * minori ("altri" tessuti) sono ripartite proporzionalmente così da sommare a 1.
 */
export function defaultDistricts(): DistrictParams[] {
  return [
    {
      key: 'splanchnic',
      nome: 'Splancnico',
      fraction: 0.26,
      autoregulated: false,
      gMinFrac: 0.2,
      gMaxFrac: 3,
    },
    { key: 'renal', nome: 'Renale', fraction: 0.21, autoregulated: false, gMinFrac: 0.2, gMaxFrac: 3 },
    { key: 'muscle', nome: 'Muscolare', fraction: 0.22, autoregulated: false, gMinFrac: 0.2, gMaxFrac: 4 },
    { key: 'skin', nome: 'Cutaneo', fraction: 0.08, autoregulated: false, gMinFrac: 0.1, gMaxFrac: 4 },
    {
      key: 'coronary',
      nome: 'Coronarico',
      fraction: 0.05,
      autoregulated: true,
      gMinFrac: 0.6,
      gMaxFrac: 2.2,
    },
    { key: 'cerebral', nome: 'Cerebrale', fraction: 0.18, autoregulated: true, gMinFrac: 0.6, gMaxFrac: 1.8 },
  ];
}

/** Indice di un distretto nell'array ordinato secondo DISTRICT_KEYS. */
export function districtIndex(key: DistrictKey): number {
  return DISTRICT_KEYS.indexOf(key);
}
