/**
 * Emodinamica — bersagli recettoriali e molecolari dei farmaci cardiovascolari.
 *
 * Ogni farmaco è un vettore di affinità su questi bersagli (vedi pharmacology.ts).
 * L'occupazione di ciascun bersaglio segue un'equazione di Hill; la mappatura
 * occupazione → parametri emodinamici ha pesi specifici per bersaglio e per distretto.
 */

export const RECEPTORS = [
  'alpha1', // adrenocettore α1 (vasocostrizione arteriosa e venosa)
  'alpha2c', // α2 centrale (simpaticolisi centrale)
  'alpha2p', // α2 periferico (vasocostrizione)
  'beta1', // β1 (inotropo, cronotropo)
  'beta2', // β2 (vasodilatazione, cronotropo, glicogenolisi → lattato)
  'beta3', // β3 (modesto, lipolisi/NO)
  'D1', // dopaminergico D1 (vasodilatazione renale/splancnica)
  'D2', // dopaminergico D2 (presinaptico)
  'V1a', // vasopressina V1a (vasocostrizione)
  'V2', // vasopressina V2 (ritenzione idrica → iponatriemia)
  'PDE3', // inibizione fosfodiesterasi 3 (inodilatatore)
  'caSens', // sensibilizzazione al calcio (levosimendan)
  'kATP', // apertura canali K-ATP (vasodilatazione)
  'noDirect', // donazione diretta di NO
  'sGCi', // inibizione della guanilato ciclasi solubile
  'lCaBlock', // blocco dei canali del calcio di tipo L
] as const;

export type Receptor = (typeof RECEPTORS)[number];

/** Vettore di attivazione (0…1 per i bersagli agonisti; occupazione per gli antagonisti). */
export type ReceptorVector = Partial<Record<Receptor, number>>;

/** Occupazione secondo Hill: O = C^n / (EC50^n + C^n). */
export function hillOccupancy(conc: number, ec50: number, n = 1): number {
  if (conc <= 0) return 0;
  const cn = Math.pow(conc, n);
  return cn / (Math.pow(ec50, n) + cn);
}
