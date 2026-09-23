import { lerp, type Pathology } from './types';

const bpm = (x: number) => `${Math.round(x)} bpm`;

export const fibrillazioneAtriale: Pathology = {
  id: 'fa',
  nome: 'Fibrillazione atriale',
  categoria: 'aritmie',
  gravita: (s) => `Risposta ventricolare ~${bpm(lerp(85, 150, s))}`,
  params: (s) => ({ rhythm: { rhythm: 'af', hr: lerp(85, 150, s), afVariability: 0.2 } }),
  scheda: {
    fisiopatologia:
      'Attività atriale caotica: perdita della sistole atriale (10–30% del riempimento, di più nei ventricoli rigidi) e intervalli RR irregolari. I battiti dopo un RR breve hanno riempimento e gittata ridotti (deficit di polso). A frequenze elevate il tempo diastolico si riduce ulteriormente.',
    emodinamica: [
      'RR irregolarmente irregolare, assenza di onde P',
      'Gittata variabile battito per battito',
      'Assenza dell’onda a nella PVC',
    ],
    eco: [
      'Assenza dell’onda A nel flusso mitralico',
      'Variabilità del VTI',
      'Ricercare trombi in auricola (TEE)',
    ],
    obiettivi: {
      fc: {
        target: '< 110 bpm',
        fare: 'Controllo della frequenza (β-bloccanti, amiodarone); cardioversione elettrica se instabile.',
        evitare: 'Frequenze elevate, soprattutto in SA, SM, CMIO, HFpEF.',
      },
      precarico: {
        target: 'Mantenere',
        fare: 'Compensare la perdita del contributo atriale.',
        evitare: 'Ipovolemia.',
      },
      postcarico: { target: 'Mantenere', fare: '—', evitare: '—' },
      contrattilita: { target: 'Mantenere', fare: '—', evitare: '—' },
    },
    chiave:
      'La perdita della sistole atriale pesa di più dove il ventricolo è rigido (SA, CMIO, HFpEF): combinala con queste patologie.',
    prova: ['Guarda la variabilità della gittata nel Wiggers.', 'Somministra esmololo.'],
  },
};

export const bradicardia: Pathology = {
  id: 'bradicardia',
  nome: 'Bradicardia sinusale',
  categoria: 'aritmie',
  gravita: (s) => bpm(lerp(48, 30, s)),
  // Nodo del seno malato: risposta cronotropa riflessa assente
  params: (s) => ({ rhythm: { rhythm: 'sinus', hr: lerp(48, 30, s) }, reflex: { gainHR: 0 } }),
  scheda: {
    fisiopatologia:
      'Con la bradicardia la gittata sistolica aumenta (diastole più lunga, Frank-Starling) ma non abbastanza da compensare la riduzione della frequenza quando il ventricolo è vicino al plateau della curva: la GC cala. Pressione diastolica bassa per il lungo deflusso diastolico.',
    emodinamica: [
      'VTD e gittata aumentati',
      'GC ridotta alle frequenze più basse',
      'Pressione diastolica ridotta, differenziale ampia',
    ],
    eco: ['Ventricoli ben riempiti', 'Fase di diastasi prolungata'],
    obiettivi: {
      fc: {
        target: 'Aumentare',
        fare: 'Atropina, adrenalina/dopamina, pacing transcutaneo o transvenoso.',
        evitare: 'Stimolazioni vagali, farmaci cronotropi negativi.',
      },
      precarico: { target: 'Mantenere', fare: '—', evitare: '—' },
      postcarico: { target: 'Mantenere', fare: '—', evitare: '—' },
      contrattilita: { target: 'Mantenere', fare: '—', evitare: '—' },
    },
    chiave: 'GC = FC × GS: quando la GS è al plateau, la frequenza è l’unica leva.',
  },
};

export const tachicardia: Pathology = {
  id: 'tachicardia',
  nome: 'Tachicardia sopraventricolare',
  categoria: 'aritmie',
  gravita: (s) => bpm(lerp(125, 195, s)),
  // Rientro: frequenza non governata dal riflesso
  params: (s) => ({ rhythm: { rhythm: 'sinus', hr: lerp(125, 195, s), pr: 0.12 }, reflex: { gainHR: 0 } }),
  scheda: {
    fisiopatologia:
      'La diastole si accorcia più della sistole: sopra ~150 bpm il riempimento ventricolare si riduce tanto che la GS e poi la GC calano. La perfusione coronarica (diastolica) si riduce mentre il consumo di O₂ aumenta.',
    emodinamica: ['VTD e gittata ridotti', 'GC in calo oltre ~150–160 bpm', 'EVR ridotto'],
    eco: ['Ventricoli sotto-riempiti', 'Fusione delle onde E e A'],
    obiettivi: {
      fc: {
        target: 'Ridurre',
        fare: 'Manovre vagali, adenosina, β-bloccanti; cardioversione sincronizzata se instabile.',
        evitare: 'Catecolamine β.',
      },
      precarico: { target: 'Mantenere', fare: '—', evitare: 'Ipovolemia.' },
      postcarico: { target: 'Mantenere', fare: '—', evitare: '—' },
      contrattilita: { target: 'Mantenere', fare: '—', evitare: '—' },
    },
    chiave:
      'La tachicardia è dannosa soprattutto dove il riempimento è già critico (SA, SM, CMIO, HFpEF) e dove il bilancio di O₂ è precario.',
  },
};

export const bav3: Pathology = {
  id: 'bav3',
  nome: 'Blocco AV di III grado',
  categoria: 'aritmie',
  gravita: (s) => `Scappamento ${bpm(lerp(45, 25, s))}`,
  params: (s) => ({ rhythm: { rhythm: 'avb3', hr: 80, escapeRate: lerp(45, 25, s) } }),
  scheda: {
    fisiopatologia:
      'Dissociazione atrio-ventricolare completa: gli atri battono alla frequenza sinusale, i ventricoli a quella di scappamento. La sistole atriale cade in momenti casuali: quando coincide con la sistole ventricolare (valvole AV chiuse) produce onde a "a cannone" nella PVC; la gittata varia battito per battito.',
    emodinamica: [
      'Bradicardia ventricolare, GC ridotta',
      'Onde a a cannone intermittenti',
      'Gittata variabile',
    ],
    eco: ['Dissociazione tra onde A e contrazione ventricolare'],
    obiettivi: {
      fc: {
        target: 'Aumentare',
        fare: 'Pacing (transcutaneo → transvenoso); adrenalina/isoprenalina come ponte.',
        evitare: 'Atropina spesso inefficace (blocco sottonodale).',
      },
      precarico: { target: 'Mantenere', fare: '—', evitare: '—' },
      postcarico: { target: 'Mantenere', fare: '—', evitare: '—' },
      contrattilita: { target: 'Mantenere', fare: '—', evitare: '—' },
    },
    chiave:
      'Guarda la traccia della PVC: onde a a cannone quando l’atrio si contrae contro la tricuspide chiusa.',
  },
};

export const ARITMIE = [fibrillazioneAtriale, bradicardia, tachicardia, bav3];
