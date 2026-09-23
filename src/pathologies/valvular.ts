import { glerp, lerp, type Pathology } from './types';

const cm2 = (a: number) => `${a.toFixed(a < 1 ? 2 : 1)} cm²`;

export const stenosiAortica: Pathology = {
  id: 'stenosi-aortica',
  nome: 'Stenosi aortica',
  categoria: 'valvolari',
  gravita: (s) => `AVA ${cm2(glerp(1.4, 0.55, s))}`,
  params: (s) => ({
    aortic: { area: glerp(1.4, 0.55, s) },
    // Ipertrofia concentrica: ↑ Ees e ↑ rigidità diastolica
    lv: { ees: lerp(3.6, 4.4, s), lambda: lerp(0.042, 0.052, s) },
    la: { lambda: lerp(0.046, 0.04, s), v0: lerp(10, 16, s) },
  }),
  morfologia: (s) => ({ lvWall: lerp(1.2, 1.6, s) }),
  scheda: {
    fisiopatologia:
      "L'ostruzione fissa all'efflusso impone un gradiente sistolico VS–aorta. Il VS si adatta con ipertrofia concentrica (legge di Laplace): lo stress parietale si normalizza al prezzo di una ridotta compliance diastolica (dipendenza dal precarico e dalla sistole atriale) e di un aumento del consumo di O₂. Il subendocardio ipertrofico è perfuso solo in diastole, con pressione di perfusione = P diastolica aortica − PTDVS: ischemia anche a coronarie sane.",
    emodinamica: [
      'Gradiente medio > 40 mmHg (grave), P sistolica VS ≫ P aortica',
      'Polso parvus et tardus, pressione differenziale ridotta',
      'PTDVS elevata con onda A prominente',
      'Gittata sistolica relativamente fissa: la PA dipende dalle RVS',
      'EVR (DPTI/SPTI) ridotto: bilancio O₂ subendocardico precario',
    ],
    eco: [
      'Valvola calcifica a ridotta escursione',
      'Vmax > 4 m/s, gradiente medio > 40 mmHg, AVA < 1 cm² (AVAi < 0.6 cm²/m²)',
      'Ipertrofia concentrica del VS, disfunzione diastolica, AS dilatato',
    ],
    obiettivi: {
      fc: {
        target: 'Bassa-normale (60–80 bpm), ritmo sinusale',
        fare: 'Mantenere il ritmo sinusale; cardioversione precoce della FA; β-bloccante (esmololo) se tachicardia.',
        evitare: 'Tachicardia (accorcia la diastole: ↓ apporto, ↑ consumo) e perdita della sistole atriale.',
      },
      precarico: {
        target: 'Pieno',
        fare: 'Mantenere la volemia; compensare prontamente le perdite.',
        evitare: 'Ipovolemia, venodilatazione (NTG), PEEP elevate.',
      },
      postcarico: {
        target: 'Mantenere le RVS',
        fare: 'Vasocostrittore α1 precoce (noradrenalina/fenilefrina) all’induzione.',
        evitare:
          'Vasodilatazione (induzione a dosi piene, blocco neuroassiale single-shot): la GS non può aumentare, la PA crolla e con essa la perfusione coronarica.',
      },
      contrattilita: {
        target: 'Mantenere',
        fare: 'Anestetici a basso impatto inotropo; inotropi solo se disfunzione conclamata.',
        evitare: 'Depressione miocardica marcata.',
      },
    },
    chiave:
      'Nella SA la postcarico "vera" è la valvola: ridurre le RVS non aumenta la gittata ma fa crollare la pressione diastolica e quindi il flusso coronarico, mentre la P sistolica del VS (domanda di O₂) resta alta. La tachicardia peggiora ulteriormente il rapporto apporto/domanda. Ipotensione → ischemia → disfunzione → ipotensione: spirale difficilmente reversibile.',
    prova: [
      'Somministra propofol: osserva PAM, P diastolica ed EVR.',
      'Aggiungi noradrenalina: ripristina la pressione di perfusione.',
      'Imposta FC 110: confronta EVR e gittata sistolica.',
      'Passa alla FA: perdita del contributo atriale.',
    ],
  },
};

export const insufficienzaAortica: Pathology = {
  id: 'insufficienza-aortica',
  nome: 'Insufficienza aortica cronica',
  categoria: 'valvolari',
  gravita: (s) => `EROA ${cm2(lerp(0.1, 0.45, s))}`,
  params: (s) => ({
    aortic: { regurgitantArea: lerp(0.1, 0.45, s) },
    // Ipertrofia eccentrica: VS dilatato e compliante, volemia espansa
    lv: { v0: lerp(25, 70, s), lambda: lerp(0.03, 0.021, s), ees: lerp(3.1, 2.6, s) },
    bloodVolume: lerp(5200, 5600, s),
  }),
  morfologia: (s) => ({ lvWall: lerp(1.1, 1.3, s) }),
  scheda: {
    fisiopatologia:
      'Rigurgito diastolico dall’aorta al VS: sovraccarico di volume e di pressione. Il VS si dilata (ipertrofia eccentrica) e aumenta la gittata totale per mantenere quella anterograda. La frazione rigurgitante dipende dal tempo diastolico e dal gradiente Ao–VS (cioè dalle RVS).',
    emodinamica: [
      'Pressione differenziale ampia, diastolica bassa (polso celere, di Corrigan)',
      'Gittata sistolica totale elevata, frazione rigurgitante > 50% nelle forme gravi',
      'VTD VS aumentato; PTDVS normale finché il VS è compliante',
    ],
    eco: [
      'Jet diastolico in LVOT; vena contracta > 6 mm, larghezza jet > 65% LVOT',
      'Pressure half-time < 200 ms',
      'Flusso olodiastolico retrogrado in aorta discendente',
      'VS dilatato (DTS > 50 mm → indicazione chirurgica)',
    ],
    obiettivi: {
      fc: {
        target: 'Normale-alta (80–100 bpm)',
        fare: 'Una FC più alta accorcia la diastole e quindi il tempo di rigurgito.',
        evitare: 'Bradicardia: prolunga la diastole e aumenta il volume rigurgitante.',
      },
      precarico: {
        target: 'Mantenere / aumentare',
        fare: 'Mantenere il riempimento del VS dilatato.',
        evitare: 'Ipovolemia.',
      },
      postcarico: {
        target: 'Ridurre',
        fare: 'Vasodilatazione moderata favorisce il flusso anterogrado.',
        evitare:
          'Aumento delle RVS (vasocostrittori puri) che aumenta la frazione rigurgitante. IABP controindicato.',
      },
      contrattilita: {
        target: 'Mantenere',
        fare: 'Inotropi β (dobutamina) se disfunzione: aumentano anche la FC.',
        evitare: 'Depressione miocardica.',
      },
    },
    chiave: '"Veloce, pieno, dilatato": FC alta, precarico adeguato e RVS basse riducono il rigurgito.',
    prova: [
      'Aumenta le RVS (noradrenalina): osserva la frazione rigurgitante.',
      'Porta la FC a 50: aumenta il volume rigurgitante.',
      'Attiva l’IABP: il gonfiaggio diastolico peggiora il rigurgito.',
    ],
  },
};

export const stenosiMitralica: Pathology = {
  id: 'stenosi-mitralica',
  nome: 'Stenosi mitralica',
  categoria: 'valvolari',
  gravita: (s) => `MVA ${cm2(glerp(2.0, 0.75, s))}`,
  params: (s) => ({
    mitral: { area: glerp(2.0, 0.75, s) },
    la: { v0: lerp(20, 45, s), lambda: lerp(0.035, 0.022, s) },
    // Ipertensione polmonare post-capillare con componente reattiva
    pulmonary: { r: glerp(0.08, 0.2, s), ca: lerp(4.5, 3.0, s) },
    rv: { ees: lerp(0.6, 0.75, s) },
    bloodVolume: lerp(5100, 5350, s),
  }),
  morfologia: (s) => ({ rvWall: lerp(1.05, 1.3, s) }),
  scheda: {
    fisiopatologia:
      'L’orifizio mitralico ristretto crea un gradiente diastolico AS–VS che dipende dal quadrato del flusso e dal tempo di riempimento. La pressione atriale sinistra si trasmette al circolo polmonare (ipertensione post-capillare, poi componente reattiva) e al VD. Il VS è piccolo e sotto-riempito.',
    emodinamica: [
      'Gradiente medio transmitralico > 10 mmHg (grave)',
      'Pressione atriale sinistra (PCWP) elevata; ipertensione polmonare',
      'VTD VS normale-ridotto, gittata ridotta',
      'Il gradiente aumenta molto con la FC (diastole più breve)',
    ],
    eco: [
      'Lembi ispessiti con apertura a "doming" (a mazza da hockey)',
      'MVA planimetrica < 1.5 cm² (grave < 1 cm²), PHT > 150 ms',
      'AS dilatato, PAPs elevata, dilatazione del VD',
    ],
    obiettivi: {
      fc: {
        target: 'Bassa (60–70 bpm)',
        fare: 'Controllo della FC (β-bloccanti, esmololo); cardioversione/controllo della FA.',
        evitare: 'Tachicardia e FA rapida: il tempo di riempimento crolla, la PCWP sale (edema polmonare).',
      },
      precarico: {
        target: 'Mantenere, senza sovraccarico',
        fare: 'Riempimento cauto guidato dalla PCWP.',
        evitare: 'Sovraccarico (edema polmonare) e ipovolemia (il VS è già sotto-riempito).',
      },
      postcarico: {
        target: 'RVS normali, RVP basse',
        fare: 'Evitare ipossia, ipercapnia, acidosi (↑ RVP); considerare vasodilatatori polmonari.',
        evitare: 'Aumenti delle RVP e crolli delle RVS.',
      },
      contrattilita: {
        target: 'Mantenere (supporto al VD)',
        fare: 'Supporto inotropo del VD se ipertensione polmonare grave.',
        evitare: 'Depressione del VD.',
      },
    },
    chiave:
      'Nella SM il nemico è la tachicardia: il gradiente dipende dal flusso al quadrato e dal tempo diastolico.',
    prova: ['Aumenta la FC a 110: osserva gradiente e pressione atriale sinistra.', 'Somministra esmololo.'],
  },
};

const mrScheda = (acuta: boolean): Pathology['scheda'] => ({
  fisiopatologia: acuta
    ? 'Rigurgito improvviso (rottura di corda, di muscolo papillare, endocardite) in un AS piccolo e poco compliante: il volume rigurgitante genera onde v giganti che si trasmettono al circolo polmonare (edema polmonare acuto). Il VS non ha avuto tempo di dilatarsi: la gittata anterograda crolla, compensata da tachicardia e vasocostrizione, che peggiorano il rigurgito.'
    : 'Sovraccarico di volume cronico: AS e VS si dilatano e diventano complianti, le pressioni di riempimento restano relativamente basse per lungo tempo. La FE sovrastima la funzione (il VS eietta anche nell’AS a bassa pressione): una FE < 60% indica già disfunzione.',
  emodinamica: acuta
    ? [
        'Onde v giganti nella traccia atriale sinistra (PCWP)',
        'PCWP media elevata, ipertensione polmonare acuta',
        'VS non dilatato e iperdinamico, gittata anterograda ridotta',
      ]
    : [
        'AS e VS dilatati, onde v moderate',
        'FE normale-alta nonostante la gittata anterograda ridotta',
        'PCWP moderatamente elevata',
      ],
  eco: acuta
    ? [
        'Lembo flail o rottura di corda',
        'Jet eccentrico con AS non dilatato',
        'VS iperdinamico',
        'Reverse flow sistolico nelle vene polmonari',
      ]
    : ['EROA ≥ 0.4 cm², volume rigurgitante ≥ 60 mL', 'Dilatazione di AS e VS', 'Vena contracta ≥ 7 mm'],
  obiettivi: {
    fc: {
      target: 'Normale-alta (80–100 bpm)',
      fare: 'FC normale-alta riduce il tempo di riempimento e le dimensioni del VS.',
      evitare: 'Bradicardia: il VS si dilata e l’anulus con lui.',
    },
    precarico: {
      target: acuta ? 'Cauto (pressioni già elevate)' : 'Mantenere',
      fare: acuta ? 'Diuretici/vasodilatatori se edema.' : 'Mantenere il riempimento.',
      evitare: acuta ? 'Carichi di volume.' : 'Ipovolemia marcata.',
    },
    postcarico: {
      target: 'Ridurre',
      fare: 'Vasodilatatori (NTG), IABP: favoriscono l’eiezione anterograda.',
      evitare: 'Vasocostrizione: aumenta la frazione rigurgitante.',
    },
    contrattilita: {
      target: 'Supportare',
      fare: 'Dobutamina/milrinone (inodilatatori).',
      evitare: 'Depressione miocardica.',
    },
  },
  chiave: acuta
    ? 'Stesso orifizio rigurgitante, conseguenze diverse: nell’IM acuta l’AS piccolo e rigido trasforma il rigurgito in onde v enormi ed edema polmonare.'
    : 'Nell’IM cronica gli adattamenti (AS e VS dilatati) mantengono basse le pressioni: la FE "normale" è ingannevole.',
  prova: [
    'Confronta la traccia PCWP con l’IM acuta/cronica.',
    'Aumenta le RVS con noradrenalina: la frazione rigurgitante aumenta.',
    'Attiva l’IABP o la NTG: aumenta la gittata anterograda.',
  ],
});

export const imAcuta: Pathology = {
  id: 'im-acuta',
  nome: 'Insufficienza mitralica acuta',
  categoria: 'valvolari',
  gravita: (s) => `EROA ${cm2(lerp(0.25, 0.7, s))}`,
  params: (s) => ({
    mitral: { regurgitantArea: lerp(0.25, 0.7, s) },
    // AS di dimensioni normali, poco compliante
    la: { lambda: lerp(0.065, 0.09, s) },
    // Vene polmonari non adattate: bassa compliance
    pulmonary: { cv: lerp(12, 8, s) },
  }),
  scheda: mrScheda(true),
};

export const imCronica: Pathology = {
  id: 'im-cronica',
  nome: 'Insufficienza mitralica cronica',
  categoria: 'valvolari',
  gravita: (s) => `EROA ${cm2(lerp(0.2, 0.6, s))}`,
  params: (s) => ({
    mitral: { regurgitantArea: lerp(0.2, 0.6, s) },
    la: { v0: lerp(18, 40, s), lambda: lerp(0.04, 0.03, s) },
    lv: { v0: lerp(20, 45, s), lambda: lerp(0.032, 0.025, s), ees: lerp(2.8, 1.9, s) },
    bloodVolume: lerp(5250, 5600, s),
  }),
  morfologia: () => ({ lvWall: 1.1 }),
  scheda: mrScheda(false),
};

export const insufficienzaTricuspidale: Pathology = {
  id: 'insufficienza-tricuspidale',
  nome: 'Insufficienza tricuspidale',
  categoria: 'valvolari',
  gravita: (s) => `EROA ${cm2(lerp(0.2, 0.9, s))}`,
  params: (s) => ({
    tricuspid: { regurgitantArea: lerp(0.2, 0.9, s) },
    ra: { v0: lerp(12, 25, s), lambda: lerp(0.042, 0.036, s) },
    rv: { v0: lerp(20, 35, s), lambda: lerp(0.022, 0.02, s) },
    bloodVolume: lerp(5400, 5900, s),
  }),
  scheda: {
    fisiopatologia:
      'Rigurgito sistolico VD→AD, spesso funzionale (dilatazione dell’anulus da sovraccarico del VD o ipertensione polmonare). Congestione venosa sistemica: epatomegalia, ascite, edemi; la PVC perde il significato di precarico.',
    emodinamica: [
      'Onda v (cv) prominente nella traccia della PVC',
      'PVC elevata, gittata del VD anterograda ridotta',
      'VD e AD dilatati',
    ],
    eco: [
      'Jet sistolico in AD; vena contracta > 7 mm',
      'Flusso sistolico inverso nelle vene sovraepatiche',
      'VCI dilatata non collassabile, dilatazione di AD e VD',
    ],
    obiettivi: {
      fc: { target: 'Normale-alta', fare: 'Mantenere il ritmo sinusale.', evitare: 'Bradicardia.' },
      precarico: {
        target: 'Mantenere (PVC alta è attesa)',
        fare: 'Precarico adeguato del VD.',
        evitare: 'Sovraccarico (dilatazione ulteriore del VD e dell’anulus).',
      },
      postcarico: {
        target: 'RVP basse',
        fare: 'Ossigenazione, normocapnia, PEEP moderate.',
        evitare: 'Ipossia, ipercapnia, acidosi, pressioni di ventilazione elevate.',
      },
      contrattilita: {
        target: 'Supporto del VD',
        fare: 'Dobutamina, milrinone.',
        evitare: 'Depressione del VD.',
      },
    },
    chiave:
      'Con IT significativa la PVC riflette il rigurgito più che il precarico: interpretare la morfologia dell’onda.',
  },
};

export const stenosiPolmonare: Pathology = {
  id: 'stenosi-polmonare',
  nome: 'Stenosi polmonare',
  categoria: 'valvolari',
  gravita: (s) => `Area ${cm2(glerp(1.0, 0.42, s))}`,
  params: (s) => ({
    pulmonic: { area: glerp(1.0, 0.42, s) },
    rv: { ees: lerp(0.9, 1.7, s), lambda: lerp(0.026, 0.03, s) },
    bloodVolume: lerp(5100, 5300, s),
  }),
  morfologia: (s) => ({ rvWall: lerp(1.4, 2.1, s) }),
  scheda: {
    fisiopatologia:
      'Ostruzione fissa all’efflusso del VD: ipertrofia concentrica del VD, ridotta compliance diastolica, dipendenza dal precarico e dalla sistole atriale. Analogia destra della stenosi aortica.',
    emodinamica: [
      'Gradiente VD–AP > 40 mmHg (grave > 64 mmHg di picco)',
      'P sistolica VD elevata con AP normale-bassa',
      'Onda a prominente nella PVC',
    ],
    eco: [
      'Valvola a cupola, Vmax > 4 m/s',
      'Ipertrofia del VD',
      'Dilatazione post-stenotica del tronco polmonare',
    ],
    obiettivi: {
      fc: { target: 'Normale', fare: 'Ritmo sinusale.', evitare: 'Tachicardia.' },
      precarico: { target: 'Pieno', fare: 'Mantenere la volemia.', evitare: 'Ipovolemia.' },
      postcarico: {
        target: 'Mantenere RVS (perfusione coronarica del VD ipertrofico)',
        fare: 'Vasocostrittore se ipotensione.',
        evitare: 'Vasodilatazione sistemica.',
      },
      contrattilita: { target: 'Mantenere', fare: '—', evitare: 'Depressione del VD.' },
    },
    chiave:
      'Come nella SA, ma a destra: il VD ipertrofico dipende dal precarico e dalla pressione di perfusione.',
  },
};

export const VALVOLARI = [
  stenosiAortica,
  insufficienzaAortica,
  stenosiMitralica,
  imAcuta,
  imCronica,
  insufficienzaTricuspidale,
  stenosiPolmonare,
];
