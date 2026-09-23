import { glerp, lerp, type Pathology } from './types';

export const shockIpovolemico: Pathology = {
  id: 'shock-ipovolemico',
  nome: 'Shock ipovolemico',
  categoria: 'shock',
  gravita: (s) => {
    const loss = lerp(700, 1900, s);
    return `Perdita ${Math.round(loss / 50) * 50} mL (${Math.round(loss / 50)}%)`;
  },
  params: (s) => ({ bloodVolume: 5000 - lerp(700, 1900, s) }),
  scheda: {
    fisiopatologia:
      'La perdita di volume riduce il volume stressed e quindi la pressione sistemica media di riempimento: cala il ritorno venoso, il precarico e la gittata (Frank-Starling). Il baroriflesso compensa con tachicardia, vasoconstrizione arteriosa e venosa (mobilizzazione del volume unstressed) e aumento dell’inotropismo: la PA si mantiene finché le perdite sono < 30%.',
    emodinamica: [
      'Tachicardia, pressione differenziale ridotta, RVS elevate',
      'PVC e PCWP basse, VTD ridotto',
      'PPV/SVV elevate in ventilazione controllata',
      'SvO₂ ridotta',
    ],
    eco: [
      'VS piccolo e iperdinamico ("kissing papillary")',
      'VCI piccola e collassabile',
      'VTI in LVOT ridotto e variabile con il respiro',
    ],
    obiettivi: {
      fc: {
        target: 'La tachicardia è compensatoria',
        fare: 'Trattare la causa.',
        evitare: 'Rallentarla farmacologicamente.',
      },
      precarico: {
        target: 'Ripristinare',
        fare: 'Cristalloidi bilanciati / emoderivati, controllo dell’emorragia.',
        evitare: 'Ritardare il volume; PEEP elevate.',
      },
      postcarico: {
        target: 'Mantenere',
        fare: 'Vasopressore solo come ponte.',
        evitare: 'Vasodilatazione (induzione a dosi piene!).',
      },
      contrattilita: { target: 'Mantenere', fare: '—', evitare: 'Cardiodepressori.' },
    },
    chiave:
      'Il paziente ipovolemico è tenuto in piedi dal simpatico: l’induzione (propofol) abolisce il tono simpatico e smaschera l’ipovolemia. Ridurre le dosi, precaricare, vasopressore pronto.',
    prova: [
      'Attiva la PPV e leggi PPV/SVV.',
      'Somministra propofol 2 mg/kg: osserva il collasso.',
      'Bolo di 500 mL: risposta della GC.',
    ],
  },
};

export const shockSettico: Pathology = {
  id: 'shock-settico',
  nome: 'Shock settico / distributivo',
  categoria: 'shock',
  gravita: (s) => `RVS ${Math.round(glerp(0.6, 0.3, s) * 1333)} dyn·s·cm⁻⁵ (basali)`,
  params: (s) => ({
    systemic: { r: glerp(0.6, 0.3, s), vv0: lerp(2550, 2900, s), ca: lerp(1.45, 1.7, s) },
    lv: { ees: lerp(3.2, 2.6, s) },
    oxygen: { vo2: lerp(260, 240, s) },
  }),
  scheda: {
    fisiopatologia:
      'La vasodilatazione arteriosa (NO, citochine) riduce le RVS; la venodilatazione sposta volume nel compartimento unstressed (ipovolemia relativa), a cui si aggiunge la perdita capillare. Nella fase iniziale "calda" il riflesso e la ridotta postcarico producono una GC alta; con la progressione compare la cardiomiopatia settica e la GC si riduce.',
    emodinamica: [
      'RVS basse, pressione diastolica bassa',
      'GC normale-alta (fase iperdinamica)',
      'SvO₂ normale-alta (estrazione tissutale alterata)',
      'Tachicardia',
    ],
    eco: [
      'VS iperdinamico, piccolo',
      'Possibile disfunzione sistolica (cardiomiopatia settica)',
      'VCI variabile',
    ],
    obiettivi: {
      fc: {
        target: 'Tollerare la tachicardia',
        fare: 'Trattare la causa.',
        evitare: 'Tachiaritmie da catecolamine eccessive.',
      },
      precarico: {
        target: 'Fluidi guidati dalla responsività',
        fare: 'Boli ripetuti con valutazione (PPV, SVV, test di sollevamento).',
        evitare: 'Sovraccarico (edema, congestione).',
      },
      postcarico: {
        target: 'Ripristinare (PAM ≥ 65 mmHg)',
        fare: 'Noradrenalina come prima scelta; vasopressina in aggiunta.',
        evitare: 'Ritardare il vasopressore.',
      },
      contrattilita: {
        target: 'Supportare se disfunzione',
        fare: 'Dobutamina o adrenalina se GC bassa nonostante precarico adeguato.',
        evitare: '—',
      },
    },
    chiave:
      'Lo shock distributivo è un problema di "contenitore": la noradrenalina ripristina il tono arterioso e venoso (↑ volume stressed).',
    prova: ['Somministra noradrenalina: PAM, RVS e PVC.', 'Confronta noradrenalina e vasopressina.'],
  },
};

export const shockCardiogeno: Pathology = {
  id: 'shock-cardiogeno',
  nome: 'Shock cardiogeno',
  categoria: 'shock',
  gravita: (s) => `Ees VS ${lerp(1.3, 0.65, s).toFixed(2)} mmHg/mL`,
  params: (s) => ({
    lv: { ees: lerp(1.3, 0.65, s), v0: lerp(20, 35, s), lambda: 0.04 },
    rv: { ees: lerp(0.5, 0.45, s) },
    mitral: { regurgitantArea: lerp(0.05, 0.15, s) },
    bloodVolume: lerp(5300, 5500, s),
  }),
  scheda: {
    fisiopatologia:
      'Insufficienza di pompa acuta (tipicamente infarto esteso): la GC cala, la PCWP sale, il riflesso simpatico aumenta FC e RVS, aumentando il consumo di O₂ e il postcarico del ventricolo insufficiente. Circolo vizioso: ipotensione → ischemia → ulteriore disfunzione.',
    emodinamica: [
      'Indice cardiaco < 2.2 L/min/m², PAS < 90 mmHg',
      'PCWP > 18 mmHg',
      'RVS elevate, SvO₂ bassa, lattati elevati',
    ],
    eco: [
      'FE gravemente ridotta',
      'IM funzionale',
      'Escludere complicanze meccaniche (DIV, rottura di papillare, tamponamento)',
    ],
    obiettivi: {
      fc: { target: 'Normale', fare: 'Trattare brady/tachiaritmie.', evitare: 'Tachicardia (consumo O₂).' },
      precarico: {
        target: 'Ottimizzare',
        fare: 'Spesso ridurre (diuretici) se congestione.',
        evitare: 'Sovraccarico.',
      },
      postcarico: {
        target: 'PAM sufficiente, RVS non eccessive',
        fare: 'Noradrenalina per la perfusione; IABP o supporto meccanico per scaricare il VS.',
        evitare: 'Vasocostrizione eccessiva.',
      },
      contrattilita: {
        target: 'Supportare',
        fare: 'Dobutamina, milrinone, adrenalina; supporto meccanico (Impella, ECMO).',
        evitare: 'Cardiodepressori.',
      },
    },
    chiave:
      'Nello shock cardiogeno servono perfusione (noradrenalina) e scarico (inotropo/IABP): il solo vasocostrittore aumenta il lavoro del VS.',
    prova: ['Attiva l’IABP.', 'Confronta noradrenalina da sola vs noradrenalina + dobutamina.'],
  },
};

export const shockOstruttivo: Pathology = {
  id: 'shock-ostruttivo',
  nome: 'Shock ostruttivo (pneumotorace iperteso)',
  categoria: 'shock',
  gravita: (s) => `P intratoracica +${Math.round(lerp(4, 13, s))} mmHg`,
  params: (s) => ({
    ventilation: { pleuralBaseline: lerp(4, 13, s), spontaneousSwing: lerp(4, 6, s) },
    pulmonary: { r: lerp(0.08, 0.12, s) },
    oxygen: { sao2: lerp(0.93, 0.82, s) },
  }),
  scheda: {
    fisiopatologia:
      'La pressione intratoracica positiva comprime le vene cave e l’atrio destro: il gradiente per il ritorno venoso (pressione sistemica media − PAD) si annulla. Il cuore è normale ma vuoto. Anche tamponamento ed embolia massiva sono shock ostruttivi (vedi schede dedicate).',
    emodinamica: [
      'PVC elevata con ventricoli piccoli',
      'Ipotensione, tachicardia, ipossiemia',
      'Peggiora bruscamente con la PPV',
    ],
    eco: ['Assenza di sliding pleurico, lung point', 'Ventricoli piccoli, VCI pletorica'],
    obiettivi: {
      fc: { target: 'Compensatoria', fare: '—', evitare: '—' },
      precarico: {
        target: 'Aumentare come ponte',
        fare: 'Fluidi in attesa della decompressione.',
        evitare: '—',
      },
      postcarico: { target: 'Mantenere', fare: 'Vasopressore come ponte.', evitare: 'Vasodilatazione.' },
      contrattilita: { target: 'Mantenere', fare: '—', evitare: '—' },
    },
    chiave:
      'Nessun farmaco risolve un’ostruzione: decompressione immediata (ago, toracostomia). Diagnosi clinica/ecografica, non radiologica.',
  },
};

export const SHOCK = [shockIpovolemico, shockSettico, shockCardiogeno, shockOstruttivo];
