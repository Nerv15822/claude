import { glerp, lerp, type Pathology } from './types';

const wood = (r: number) => `RVP ~${((r * 1333) / 80).toFixed(1)} UW`;

const vdGoals: Pathology['scheda']['obiettivi'] = {
  fc: {
    target: 'Normale, ritmo sinusale',
    fare: 'Mantenere la sincronia AV.',
    evitare: 'Bradicardia e aritmie.',
  },
  precarico: {
    target: 'Cauto',
    fare: 'Piccoli boli (250 mL) rivalutando: il VD sovradistesto sposta il setto e riduce il riempimento del VS.',
    evitare: 'Carichi di volume liberali.',
  },
  postcarico: {
    target: 'RVP basse, RVS conservate',
    fare: 'O₂, normocapnia, correzione dell’acidosi, vasodilatatori polmonari (NO inalatorio); noradrenalina per mantenere PAM > PAP (perfusione coronarica del VD).',
    evitare:
      'Ipossia, ipercapnia, PEEP e pressioni di plateau elevate; vasodilatazione sistemica (induzione).',
  },
  contrattilita: {
    target: 'Supportare il VD',
    fare: 'Dobutamina, milrinone (anche vasodilatatore polmonare).',
    evitare: 'Anestetici cardiodepressori.',
  },
};

export const epMassiva: Pathology = {
  id: 'embolia-polmonare',
  nome: 'Embolia polmonare massiva',
  categoria: 'polmonari',
  gravita: (s) => wood(glerp(0.25, 0.6, s)),
  params: (s) => ({
    pulmonary: { r: glerp(0.25, 0.6, s), ca: lerp(3.5, 2.2, s) },
    rv: { ees: lerp(0.52, 0.4, s), lambda: lerp(0.023, 0.02, s) },
    oxygen: { sao2: lerp(0.93, 0.84, s) },
    bloodVolume: 5000,
  }),
  scheda: {
    fisiopatologia:
      'L’ostruzione acuta del letto polmonare aumenta bruscamente il postcarico di un VD non allenato (non può generare più di ~40–50 mmHg di pressione sistolica). Il VD si dilata, il setto si sposta verso sinistra (VS a "D" in asse corto), il riempimento del VS cala per interdipendenza ventricolare. La pressione del VD sale mentre la PAM scende: la perfusione coronarica del VD crolla, innescando la spirale ischemica.',
    emodinamica: [
      'PVC elevata, PAP sistolica 40–60 mmHg (mai molto alta in acuto)',
      'VD dilatato, VS piccolo e sotto-riempito',
      'Ipotensione, tachicardia, ipossiemia',
      'GC ridotta; SvO₂ bassa',
    ],
    eco: [
      'VD dilatato (VD/VS > 1), setto appiattito a "D"',
      'Segno di McConnell (acinesia della parete libera con apice risparmiato)',
      'Segno 60/60, trombi in transito',
      'VCI dilatata',
    ],
    obiettivi: vdGoals,
    chiave:
      'Il VD acutamente sovraccaricato muore di ischemia: mantenere PAM > PAP con noradrenalina, evitare ipossia/ipercapnia e l’induzione aggressiva; i fluidi sono spesso dannosi.',
    prova: [
      'Osserva la sezione in asse corto: VS a "D".',
      'Somministra 500 mL: la GC non migliora e il setto si sposta ancora.',
      'Somministra noradrenalina e dobutamina.',
    ],
  },
};

export const ipertensionePolmonare: Pathology = {
  id: 'ipertensione-polmonare',
  nome: 'Ipertensione polmonare cronica',
  categoria: 'polmonari',
  gravita: (s) => wood(glerp(0.2, 0.45, s)),
  params: (s) => ({
    pulmonary: { r: glerp(0.2, 0.45, s), ca: lerp(3, 1.6, s) },
    rv: { ees: lerp(0.95, 1.4, s), lambda: lerp(0.028, 0.034, s), v0: lerp(20, 35, s) },
    ra: { v0: lerp(12, 25, s) },
    oxygen: { sao2: lerp(0.95, 0.9, s) },
    bloodVolume: lerp(5150, 5400, s),
  }),
  morfologia: (s) => ({ rvWall: lerp(1.5, 2.2, s) }),
  scheda: {
    fisiopatologia:
      'Il rimodellamento vascolare polmonare aumenta cronicamente le RVP; il VD si adatta con ipertrofia (↑ Ees: accoppiamento ventricolo-arterioso conservato) fino allo scompenso, quando si dilata. Il VD ipertrofico è perfuso anche in sistole solo se la PAM supera ampiamente la P ventricolare: l’ipotensione sistemica è mal tollerata.',
    emodinamica: [
      'PAPm > 20 mmHg (grave > 40), RVP > 3 UW',
      'P sistolica VD elevata, PCWP normale (pre-capillare)',
      'GC normale-ridotta, fissa',
    ],
    eco: [
      'Ipertrofia e dilatazione del VD',
      'TR Vmax > 3.4 m/s, PAPs stimata elevata',
      'Setto appiattito, AD dilatato, versamento pericardico (prognosi sfavorevole)',
    ],
    obiettivi: vdGoals,
    chiave:
      'Evitare tutto ciò che aumenta le RVP (ipossia, ipercapnia, acidosi, dolore, ipotermia) e tutto ciò che abbassa le RVS.',
    prova: [
      'Somministra milrinone: ↓ RVP e ↑ contrattilità.',
      'Somministra propofol: osserva il rapporto PAP/PAM.',
    ],
  },
};

export const POLMONARI = [epMassiva, ipertensionePolmonare];
