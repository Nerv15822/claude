import { lerp, type Pathology } from './types';

export const tamponamento: Pathology = {
  id: 'tamponamento',
  nome: 'Tamponamento cardiaco',
  categoria: 'pericardiche',
  gravita: (s) => `Versamento ${Math.round(lerp(250, 430, s))} mL`,
  params: (s) => ({ pericardium: { effusion: lerp(250, 430, s) } }),
  scheda: {
    fisiopatologia:
      'Il versamento pericardico, oltre il tratto piatto della curva pressione–volume del pericardio, fa salire la pressione intrapericardica, che si somma a tutte le camere: le pressioni diastoliche si equalizzano e il riempimento è limitato. Il volume cardiaco totale è fisso: in inspirazione il VD si riempie a spese del VS (interdipendenza), da cui il polso paradosso. Le camere a bassa pressione (AD, poi VD) collassano per prime.',
    emodinamica: [
      'Equalizzazione delle pressioni diastoliche (PVC ≈ PTDVD ≈ PCWP ≈ P pericardica)',
      'Polso paradosso > 10 mmHg (calo della sistolica in inspirazione)',
      'Tachicardia, GS piccola e fissa: la GC dipende dalla FC',
      'Scomparsa della discesa y nella PVC',
    ],
    eco: [
      'Versamento pericardico circonferenziale',
      'Collasso sistolico dell’AD e diastolico del VD',
      'VCI pletorica non collassabile',
      'Variazione respiratoria del flusso mitralico > 25% e tricuspidale > 40%',
    ],
    obiettivi: {
      fc: {
        target: 'Alta (mantenere la tachicardia)',
        fare: 'La tachicardia compensatoria è l’unico modo di mantenere la GC.',
        evitare: 'Bradicardia, β-bloccanti.',
      },
      precarico: {
        target: 'Aumentare',
        fare: 'Fluidi in attesa del drenaggio.',
        evitare: 'Ipovolemia, venodilatazione.',
      },
      postcarico: {
        target: 'Mantenere',
        fare: 'Noradrenalina come ponte.',
        evitare: 'Vasodilatazione (induzione!).',
      },
      contrattilita: {
        target: 'Mantenere',
        fare: 'Inotropi come ponte.',
        evitare: 'Depressione miocardica.',
      },
    },
    chiave:
      'Drenare prima di addormentare: induzione e ventilazione a pressione positiva (↓ ritorno venoso, perdita del tono simpatico) possono causare arresto. Mantenere il respiro spontaneo; pericardiocentesi in anestesia locale.',
    prova: [
      'Osserva il polso paradosso (ΔPAS) nel monitor.',
      'Attiva la PPV: la gittata cala ulteriormente.',
      'Esegui la pericardiocentesi.',
    ],
  },
};

export const costrittiva: Pathology = {
  id: 'pericardite-costrittiva',
  nome: 'Pericardite costrittiva',
  categoria: 'pericardiche',
  gravita: (s) => `Rigidità pericardica ×${lerp(2.5, 5, s).toFixed(1)}`,
  params: (s) => ({
    pericardium: { v0: lerp(360, 325, s), vk: lerp(9, 6, s), pleuralTransmission: lerp(0.45, 0.15, s) },
    bloodVolume: lerp(5300, 5600, s),
  }),
  scheda: {
    fisiopatologia:
      'Il pericardio ispessito e rigido crea un involucro a volume fisso: il riempimento protodiastolico è rapidissimo (camere non limitate finché il volume è sotto quello del "guscio") e si arresta bruscamente quando il pericardio raggiunge il suo limite (dip-and-plateau o "radice quadrata"). Il pericardio isola le camere dalle variazioni della pressione intratoracica: in inspirazione il ritorno venoso non aumenta (segno di Kussmaul) e il riempimento sinistro cala (dissociazione intratoraco-intracardiaca).',
    emodinamica: [
      'Dip-and-plateau nella pressione diastolica ventricolare',
      'Equalizzazione delle pressioni diastoliche (differenza < 5 mmHg)',
      'Discesa y profonda nella PVC (a differenza del tamponamento)',
      'PVC elevata che non scende in inspirazione (Kussmaul)',
    ],
    eco: [
      'Pericardio ispessito/calcifico',
      'Rimbalzo settale respirofasico (septal bounce)',
      'e′ mediale conservato o aumentato (annulus reversus)',
      'VCI dilatata, variazione respiratoria dei flussi',
    ],
    obiettivi: {
      fc: { target: 'Normale-alta', fare: 'La GS è fissa: la GC dipende dalla FC.', evitare: 'Bradicardia.' },
      precarico: {
        target: 'Mantenere (pressioni alte)',
        fare: 'Mantenere la volemia.',
        evitare: 'Diuresi eccessiva.',
      },
      postcarico: {
        target: 'Mantenere',
        fare: 'Vasocostrittore se necessario.',
        evitare: 'Vasodilatazione.',
      },
      contrattilita: { target: 'Mantenere', fare: '—', evitare: 'Depressione miocardica.' },
    },
    chiave:
      'Tamponamento e costrizione limitano entrambi il riempimento, ma con morfologie diverse: y assente vs y profonda con dip-and-plateau.',
    prova: [
      'Guarda la pressione del VD nel diagramma di Wiggers: dip-and-plateau.',
      'Confronta con il tamponamento.',
    ],
  },
};

export const PERICARDICHE = [tamponamento, costrittiva];
