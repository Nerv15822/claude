import { lerp, type Pathology } from './types';

const shuntGoals = (volume: string): Pathology['scheda']['obiettivi'] => ({
  fc: {
    target: 'Normale',
    fare: 'Mantenere il ritmo sinusale.',
    evitare: 'Aritmie (FA frequente nei DIA dell’adulto).',
  },
  precarico: {
    target: 'Mantenere',
    fare: `Il ${volume} è già sovraccaricato di volume.`,
    evitare: 'Sovraccarico; bolle d’aria nelle linee (embolia paradossa).',
  },
  postcarico: {
    target: 'Equilibrio RVS/RVP',
    fare: 'Per ridurre uno shunt sinistro→destro: evitare aumenti delle RVS e cali delle RVP (FiO₂ elevata, ipocapnia).',
    evitare:
      'Aumenti delle RVP (ipossia, ipercapnia, PEEP elevate) che possono invertire lo shunt (destro→sinistro, desaturazione).',
  },
  contrattilita: { target: 'Mantenere', fare: '—', evitare: '—' },
});

export const dia: Pathology = {
  id: 'dia',
  nome: 'Difetto interatriale (DIA)',
  categoria: 'shunt',
  gravita: (s) => `Difetto ${lerp(0.4, 2.5, s).toFixed(1)} cm²`,
  params: (s) => ({
    asd: { area: lerp(0.4, 2.5, s) },
    // Sovraccarico di volume cronico: VD dilatato e compliante
    rv: { v0: lerp(20, 45, s), lambda: lerp(0.022, 0.017, s) },
  }),
  scheda: {
    fisiopatologia:
      'Lo shunt atriale è determinato dalla differenza di compliance diastolica tra i ventricoli, più che dalla piccola differenza pressoria tra gli atri: il VD più compliante accoglie il flusso. Sovraccarico di volume di AD, VD e circolo polmonare; nel tempo, ipertensione polmonare e possibile inversione (sindrome di Eisenmenger).',
    emodinamica: [
      'Qp/Qs > 1.5 nei difetti significativi',
      'AD e VD dilatati, iperafflusso polmonare',
      'Pressioni atriali quasi uguali',
    ],
    eco: [
      'Discontinuità del setto interatriale al color-Doppler',
      'Dilatazione delle sezioni destre, movimento settale paradosso',
      'Test alle microbolle positivo',
    ],
    obiettivi: shuntGoals('VD'),
    chiave:
      'Il verso e l’entità dello shunt dipendono dal rapporto tra le resistenze (e compliance) a valle: si possono manipolare con FiO₂, ventilazione e vasopressori.',
    prova: [
      'Aumenta le RVS con noradrenalina e osserva il Qp/Qs.',
      'Colora le particelle per saturazione: lo shunt è evidenziato.',
    ],
  },
};

export const div: Pathology = {
  id: 'div',
  nome: 'Difetto interventricolare (DIV)',
  categoria: 'shunt',
  gravita: (s) => `Difetto ${lerp(0.1, 0.8, s).toFixed(2)} cm²`,
  params: (s) => ({ vsd: { area: lerp(0.1, 0.8, s) } }),
  scheda: {
    fisiopatologia:
      'Shunt sistolico sinistro→destro (VS→VD→AP): il sangue shuntato ritorna al cuore sinistro, quindi il sovraccarico di volume interessa AS e VS. Nei difetti ampi (non restrittivi) le pressioni ventricolari si equalizzano e il circolo polmonare è esposto alla pressione sistemica.',
    emodinamica: ['Qp/Qs elevato', 'AS e VS dilatati', 'Ipertensione polmonare nei difetti ampi'],
    eco: [
      'Jet sistolico VS→VD al color-Doppler',
      'Gradiente VS–VD (restrittivo se > 64 mmHg)',
      'Dilatazione di AS e VS',
    ],
    obiettivi: shuntGoals('VS'),
    chiave:
      'Il DIV sovraccarica il cuore sinistro (il volume shuntato ricircola attraverso i polmoni), il DIA quello destro.',
  },
};

export const pda: Pathology = {
  id: 'pda',
  nome: 'Dotto arterioso pervio (PDA)',
  categoria: 'shunt',
  gravita: (s) => `Dotto ${lerp(0.08, 0.4, s).toFixed(2)} cm²`,
  params: (s) => ({ pda: { area: lerp(0.08, 0.4, s) } }),
  scheda: {
    fisiopatologia:
      'Comunicazione aorta–arteria polmonare con flusso continuo (sistolico e diastolico) sinistro→destro: fuga diastolica dall’aorta (pressione diastolica bassa, "furto" diastolico) e sovraccarico di volume del cuore sinistro.',
    emodinamica: [
      'Pressione diastolica aortica bassa, pressione differenziale ampia',
      'Qp/Qs elevato',
      'AS e VS dilatati',
    ],
    eco: [
      'Flusso continuo nel tronco polmonare',
      'Flusso diastolico retrogrado in aorta discendente',
      'Dilatazione di AS e VS',
    ],
    obiettivi: shuntGoals('VS'),
    chiave:
      'Il flusso nel dotto è continuo perché la pressione aortica supera quella polmonare in tutto il ciclo.',
  },
};

export const SHUNT = [dia, div, pda];
