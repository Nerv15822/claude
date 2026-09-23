import { lerp, type Pathology } from './types';

const fe = (s: number, a: number, b: number) => `FE attesa ~${Math.round(lerp(a, b, s))}%`;

export const hfref: Pathology = {
  id: 'hfref',
  nome: 'Scompenso a FE ridotta (HFrEF)',
  categoria: 'miocardiche',
  gravita: (s) => fe(s, 40, 20),
  params: (s) => ({
    lv: { ees: lerp(1.2, 0.55, s), v0: lerp(30, 70, s), lambda: lerp(0.032, 0.027, s) },
    rv: { ees: lerp(0.5, 0.42, s) },
    pulmonary: { r: lerp(0.075, 0.1, s) },
    mitral: { regurgitantArea: lerp(0, 0.12, s) },
    bloodVolume: lerp(5500, 6100, s),
  }),
  morfologia: () => ({ lvWall: 0.95 }),
  scheda: {
    fisiopatologia:
      'Riduzione della contrattilità (Ees): la ESPVR si abbassa, il VS si dilata (rimodellamento eccentrico) e la gittata viene mantenuta sfruttando la legge di Frank-Starling a prezzo di pressioni di riempimento elevate. L’attivazione neuro-ormonale (simpatico, RAA) aumenta volemia e postcarico, peggiorando il lavoro cardiaco. La gittata è molto sensibile al postcarico.',
    emodinamica: [
      'FE < 40%, VTD VS aumentato',
      'PCWP elevata, possibile ipertensione polmonare post-capillare',
      'GC ridotta, RVS aumentate, SvO₂ ridotta',
      'IM funzionale da dilatazione dell’anulus',
    ],
    eco: [
      'VS dilatato con ipocinesia globale',
      'FE < 40%, GLS ridotto',
      'E/e′ elevato, IM funzionale',
      'TAPSE per la funzione del VD',
    ],
    obiettivi: {
      fc: {
        target: 'Normale (70–90 bpm)',
        fare: 'Mantenere il ritmo sinusale.',
        evitare: 'Bradicardia (GS fissa) e tachicardia (ischemia).',
      },
      precarico: {
        target: 'Ottimizzare (spesso ridurre)',
        fare: 'Diuretici/NTG se congestione; fluidi solo se precarico-responsivo.',
        evitare: 'Sovraccarico di volume.',
      },
      postcarico: {
        target: 'Ridurre',
        fare: 'Vasodilatatori, inodilatatori (milrinone), IABP.',
        evitare: 'Aumenti bruschi delle RVS (vasocostrittori puri): la GS cala.',
      },
      contrattilita: {
        target: 'Supportare',
        fare: 'Dobutamina, milrinone, adrenalina a basse dosi.',
        evitare: 'Anestetici cardiodepressori a dosi piene, β-bloccanti in acuto.',
      },
    },
    chiave:
      'Il VS insufficiente è "sensibile al postcarico": ridurre le RVS aumenta la gittata più di quanto riduca la pressione.',
    prova: [
      'Confronta NTG, dobutamina e milrinone sul loop PV.',
      'Aumenta le RVS: osserva la caduta della gittata.',
    ],
  },
};

export const hfpef: Pathology = {
  id: 'hfpef',
  nome: 'Scompenso a FE preservata (HFpEF)',
  categoria: 'miocardiche',
  gravita: (s) => `Rigidità diastolica ×${lerp(1.4, 2.2, s).toFixed(1)}`,
  params: (s) => ({
    lv: { lambda: lerp(0.05, 0.07, s), ees: lerp(4.0, 5.0, s), p0: lerp(0.25, 0.32, s) },
    la: { v0: lerp(12, 22, s) },
    systemic: { ca: lerp(1.1, 0.8, s), r: lerp(1.05, 1.15, s) },
    bloodVolume: lerp(5150, 5350, s),
  }),
  morfologia: (s) => ({ lvWall: lerp(1.3, 1.55, s) }),
  scheda: {
    fisiopatologia:
      'Rilasciamento e compliance diastolica ridotti (ipertrofia, fibrosi, rigidità arteriosa): la EDPVR è ripida, quindi piccole variazioni di volume producono grandi variazioni di pressione. Il paziente oscilla tra edema polmonare (lieve sovraccarico) e ipotensione (lieve ipovolemia o tachicardia).',
    emodinamica: [
      'FE ≥ 50%, VTD normale-ridotto',
      'PTDVS e PCWP elevate',
      'Pressione differenziale ampia (rigidità arteriosa)',
    ],
    eco: [
      'Ipertrofia concentrica, AS dilatato',
      'E/e′ > 14, e′ settale < 7 cm/s',
      'Volume AS indicizzato > 34 mL/m², TR Vmax > 2.8 m/s',
    ],
    obiettivi: {
      fc: {
        target: 'Bassa-normale, ritmo sinusale',
        fare: 'Tempo di riempimento adeguato; contributo atriale essenziale.',
        evitare: 'Tachicardia e FA.',
      },
      precarico: {
        target: 'Mantenere con precisione',
        fare: 'Boli piccoli e rivalutati.',
        evitare: 'Sia sovraccarico (edema) sia ipovolemia (ipotensione).',
      },
      postcarico: {
        target: 'Mantenere / controllare l’ipertensione',
        fare: '—',
        evitare: 'Ipertensione marcata e ipotensione.',
      },
      contrattilita: { target: 'Mantenere', fare: '—', evitare: 'Inotropi non necessari (tachicardia).' },
    },
    chiave:
      'EDPVR ripida = finestra terapeutica stretta: la stessa quantità di volume che non sposta il normale può causare edema.',
    prova: ['Somministra un bolo di 500 mL e osserva PTDVS e PCWP.', 'Passa alla FA.'],
  },
};

export const hocm: Pathology = {
  id: 'hocm',
  nome: 'Cardiomiopatia ipertrofica ostruttiva',
  categoria: 'miocardiche',
  gravita: (s) => `Gradiente LVOT a riposo ~${Math.round(lerp(30, 90, s))} mmHg`,
  params: (s) => ({
    // La gravità anticipa il contatto SAM–setto (volume a cui inizia l'ostruzione)
    lvot: { obstruction: lerp(0.88, 0.94, s), vLow: lerp(55, 75, s), vHigh: lerp(100, 118, s) },
    lv: { lambda: lerp(0.045, 0.052, s), ees: lerp(4.2, 5.2, s), p0: 0.25 },
    // IM da SAM
    mitral: { regurgitantArea: lerp(0.03, 0.15, s) },
  }),
  morfologia: (s) => ({ lvWall: lerp(1.5, 1.9, s) }),
  scheda: {
    fisiopatologia:
      'Ipertrofia settale asimmetrica: durante l’eiezione il flusso accelerato nel tratto di efflusso ristretto trascina il lembo anteriore mitralico contro il setto (SAM, effetto Venturi/drag). L’ostruzione è DINAMICA: aumenta quando il VS è più piccolo (ipovolemia, venodilatazione, tachicardia) o più contrattile (inotropi), e quando la P aortica è bassa (vasodilatazione). Il SAM causa anche IM eccentrica.',
    emodinamica: [
      'Gradiente sottoaortico dinamico (≥ 30 mmHg a riposo, ≥ 50 significativo)',
      'Segno di Brockenbrough: dopo un’extrasistole il gradiente aumenta e la pressione differenziale aortica diminuisce',
      'PTDVS elevata (disfunzione diastolica)',
    ],
    eco: [
      'Spessore settale ≥ 15 mm, rapporto setto/parete posteriore > 1.3',
      'SAM del lembo anteriore mitralico',
      'Doppler continuo in LVOT a "pugnale" (picco tardivo)',
      'IM eccentrica diretta posteriormente',
    ],
    obiettivi: {
      fc: {
        target: 'Bassa (55–70 bpm)',
        fare: 'β-bloccanti (esmololo): prolungano il riempimento e riducono la contrattilità.',
        evitare: 'Tachicardia.',
      },
      precarico: {
        target: 'Aumentare',
        fare: 'Carico di volume: un VS pieno allontana il lembo dal setto.',
        evitare: 'Ipovolemia, NTG, PEEP elevate.',
      },
      postcarico: {
        target: 'Aumentare / mantenere',
        fare: 'Fenilefrina, noradrenalina, vasopressina.',
        evitare: 'Vasodilatatori (propofol a dosi piene, NTG, milrinone).',
      },
      contrattilita: {
        target: 'Ridurre',
        fare: 'β-bloccanti; anestetici volatili a dosi moderate.',
        evitare: 'Inotropi (dobutamina, adrenalina, milrinone): peggiorano l’ostruzione.',
      },
    },
    chiave:
      'Nella CMIO l’ipotensione si tratta con volume e vasocostrittore, MAI con inotropi: la dobutamina aumenta il gradiente e fa crollare la gittata.',
    prova: [
      'Somministra dobutamina: osserva il gradiente in LVOT.',
      'Somministra NTG o riduci la volemia: l’ostruzione peggiora.',
      'Bolo di fluidi + noradrenalina + esmololo: il gradiente si riduce.',
    ],
  },
};

export const infartoVD: Pathology = {
  id: 'infarto-vd',
  nome: 'Infarto del ventricolo destro',
  categoria: 'miocardiche',
  gravita: (s) => `Contrattilità VD ${Math.round(lerp(55, 20, s))}%`,
  params: (s) => ({
    rv: { ees: lerp(0.22, 0.08, s), lambda: lerp(0.03, 0.04, s) },
    bloodVolume: lerp(5200, 5400, s),
  }),
  scheda: {
    fisiopatologia:
      'Il VD ischemico (occlusione prossimale della coronaria destra, spesso con infarto inferiore) non riesce a generare pressione: il VD si dilata, la PVC sale e il VS resta sotto-riempito (bassa gittata con PCWP normale-bassa). Il VD dilatato nel pericardio spinge il setto verso sinistra (interdipendenza ventricolare), peggiorando il riempimento del VS.',
    emodinamica: [
      'PVC elevata ≥ PCWP (rapporto PVC/PCWP > 0.8)',
      'Ipotensione con campi polmonari puliti',
      'Pressione differenziale del VD ridotta',
      'Forte dipendenza dal precarico e dalla sincronia AV (BAV frequente)',
    ],
    eco: [
      'VD dilatato e ipocinetico, TAPSE < 17 mm',
      'Setto spostato a sinistra, VS piccolo',
      'VCI dilatata',
      'Acinesia inferiore del VS',
    ],
    obiettivi: {
      fc: {
        target: 'Normale, sincronia AV',
        fare: 'Pacing sequenziale AV se BAV; atropina.',
        evitare: 'Bradicardia e perdita della sistole atriale.',
      },
      precarico: {
        target: 'Mantenere / aumentare con cautela',
        fare: 'Boli di fluidi finché PVC ~12–15 mmHg con risposta della GC.',
        evitare: 'Nitrati, diuretici, morfina; sovraccarico eccessivo (shift settale).',
      },
      postcarico: {
        target: 'RVP basse, PAM conservata',
        fare: 'Noradrenalina per la perfusione coronarica del VD; ossigenazione e normocapnia.',
        evitare: 'Ipossia, ipercapnia, PEEP/pressioni di plateau elevate.',
      },
      contrattilita: {
        target: 'Supportare il VD',
        fare: 'Dobutamina, milrinone.',
        evitare: 'Anestetici cardiodepressori.',
      },
    },
    chiave: 'Ipotensione + PVC alta + polmoni asciutti = VD. I nitrati possono causare un crollo pressorio.',
    prova: [
      'Somministra NTG: crollo del precarico.',
      'Bolo di 250 mL: miglioramento della GC.',
      'Attiva la PPV con PEEP 12.',
    ],
  },
};

export const infartoAnteriore: Pathology = {
  id: 'infarto-anteriore',
  nome: 'Infarto anteriore esteso',
  categoria: 'miocardiche',
  gravita: (s) => `Miocardio acinetico ${Math.round(lerp(20, 45, s))}%`,
  params: (s) => ({
    lv: { ees: lerp(2.3, 1.1, s), lambda: lerp(0.04, 0.046, s), v0: lerp(15, 30, s) },
    mitral: { regurgitantArea: lerp(0, 0.1, s) },
  }),
  scheda: {
    fisiopatologia:
      'L’occlusione dell’arteria discendente anteriore rende acinetica la parete anteriore, il setto e l’apice: la contrattilità globale cala bruscamente senza il tempo per un rimodellamento. Il miocardio ischemico è anche più rigido (disfunzione diastolica). Il riflesso simpatico sostiene la pressione ma aumenta il consumo di O₂.',
    emodinamica: [
      'FE ridotta, VTS aumentato',
      'PCWP elevata (congestione, edema polmonare)',
      'Tachicardia riflessa, RVS aumentate',
      'Rischio di shock cardiogeno',
    ],
    eco: [
      'Acinesia antero-settale e apicale',
      'FE ridotta, possibile trombo apicale',
      'Complicanze: IM, DIV post-infartuale, versamento',
    ],
    obiettivi: {
      fc: { target: 'Normale-bassa', fare: 'Ridurre il consumo di O₂.', evitare: 'Tachicardia.' },
      precarico: {
        target: 'Ottimizzare',
        fare: 'NTG se congestione e PA adeguata.',
        evitare: 'Sovraccarico.',
      },
      postcarico: {
        target: 'PAM ≥ 65 con RVS non eccessive',
        fare: 'IABP: ↑ perfusione coronarica diastolica e ↓ postcarico.',
        evitare: 'Ipotensione (perfusione coronarica) e ipertensione (postcarico).',
      },
      contrattilita: {
        target: 'Supportare se shock',
        fare: 'Dobutamina/noradrenalina; supporto meccanico.',
        evitare: 'Inotropi non necessari (↑ consumo di O₂).',
      },
    },
    chiave:
      'Bilanciare apporto e consumo di O₂: pressione diastolica per le coronarie, FC e postcarico bassi per il consumo.',
    prova: [
      'Attiva l’IABP: aumento diastolico e scarico sistolico.',
      'Somministra dobutamina e osserva FC e FE.',
    ],
  },
};

export const MIOCARDICHE = [hfref, hfpef, hocm, infartoVD, infartoAnteriore];
