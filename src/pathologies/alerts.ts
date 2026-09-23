import type { BeatMetrics } from '@physiology/metrics';
import type { Params } from '@physiology/params';

export type Livello = 'critico' | 'attenzione' | 'info';

export interface Avviso {
  id: string;
  livello: Livello;
  titolo: string;
  testo: string;
}

interface Ctx {
  caseId: string | null;
  b: BeatMetrics;
  p: Params;
}

type Regola = (c: Ctx) => Avviso | null;

const vasodilatatori = (p: Params) => p.drugs.nitroglycerin > 0 || p.drugs.milrinone > 0;
const inotropi = (p: Params) => p.drugs.dobutamine > 0 || p.drugs.adrenaline > 0 || p.drugs.milrinone > 0;

/**
 * Regole didattiche: interpretano lo stato emodinamico corrente alla luce del caso clinico.
 * Nessuna logica fisiologica: leggono solo metriche e parametri.
 */
const REGOLE: Regola[] = [
  ({ b }) =>
    b.aoMean < 60
      ? {
          id: 'ipotensione',
          livello: 'critico',
          titolo: `Ipotensione grave (PAM ${b.aoMean.toFixed(0)} mmHg)`,
          testo:
            'Perfusione d’organo e coronarica compromesse. Identifica il determinante: precarico, postcarico, contrattilità o frequenza?',
        }
      : null,
  ({ caseId, b }) =>
    caseId === 'stenosi-aortica' && b.evr < 0.5
      ? {
          id: 'sa-evr',
          livello: 'critico',
          titolo: `SA: ischemia subendocardica (EVR ${b.evr.toFixed(2)})`,
          testo: `La pressione diastolica aortica (${b.aoDia.toFixed(0)} mmHg) meno la PTDVS (${b.lvEdp.toFixed(0)}) non basta a perfondere un VS che genera ${b.lvSys.toFixed(0)} mmHg. Ripristina la pressione diastolica (vasocostrittore α) e rallenta la FC.`,
        }
      : null,
  ({ caseId, b }) =>
    (caseId === 'stenosi-aortica' ||
      caseId === 'stenosi-mitralica' ||
      caseId === 'hocm' ||
      caseId === 'hfpef') &&
    b.hr > 100
      ? {
          id: 'tachicardia-critica',
          livello: 'attenzione',
          titolo: `Tachicardia (${b.hr.toFixed(0)} bpm) in una patologia dipendente dal riempimento`,
          testo:
            'La diastole si accorcia: riempimento e perfusione coronarica si riducono. Tratta la causa (ipovolemia, dolore, ipotensione) e considera l’esmololo.',
        }
      : null,
  ({ caseId, p }) =>
    caseId === 'stenosi-aortica' && (vasodilatatori(p) || p.systemic.r < 0.75)
      ? {
          id: 'sa-vasodilatazione',
          livello: 'attenzione',
          titolo: 'SA: vasodilatazione',
          testo:
            'Con un orifizio fisso la gittata non può aumentare: ridurre le RVS abbassa la pressione diastolica, non il lavoro del VS.',
        }
      : null,
  ({ caseId, b, p }) =>
    caseId === 'hocm' && inotropi(p)
      ? {
          id: 'hocm-inotropi',
          livello: 'critico',
          titolo: `CMIO: inotropo in corso (gradiente ${b.avPeakGradient.toFixed(0)} mmHg)`,
          testo:
            'L’inotropismo riduce il volume del VS e peggiora il SAM: sospendi e usa volume, vasocostrittore e β-bloccante.',
        }
      : null,
  ({ caseId, p }) =>
    (caseId === 'infarto-vd' || caseId === 'hocm' || caseId === 'tamponamento') && p.drugs.nitroglycerin > 0
      ? {
          id: 'nitrati',
          livello: 'critico',
          titolo: 'Nitrati in una patologia precarico-dipendente',
          testo: 'La venodilatazione riduce il riempimento ventricolare: rischio di collasso emodinamico.',
        }
      : null,
  ({ caseId, p }) =>
    (caseId === 'tamponamento' || caseId === 'embolia-polmonare' || caseId === 'shock-ostruttivo') &&
    p.ventilation.mode === 'ppv'
      ? {
          id: 'ppv-ostruzione',
          livello: 'attenzione',
          titolo: 'Ventilazione a pressione positiva',
          testo:
            'La pressione intratoracica positiva riduce ulteriormente il ritorno venoso (e aumenta il postcarico del VD).',
        }
      : null,
  ({ caseId, p, b }) =>
    (caseId === 'insufficienza-aortica' || caseId === 'im-acuta' || caseId === 'im-cronica') &&
    (p.drugs.noradrenaline > 0.1 || p.drugs.vasopressin > 0)
      ? {
          id: 'rigurgito-vasocostrizione',
          livello: 'attenzione',
          titolo: `Vasocostrizione in un’insufficienza valvolare (frazione rigurgitante ${((caseId === 'insufficienza-aortica' ? b.arFraction : b.mrFraction) * 100).toFixed(0)}%)`,
          testo: 'L’aumento delle RVS favorisce il rigurgito a scapito del flusso anterogrado.',
        }
      : null,
  ({ caseId, p }) =>
    caseId === 'insufficienza-aortica' && p.iabp.enabled
      ? {
          id: 'ia-iabp',
          livello: 'critico',
          titolo: 'IABP controindicato nell’insufficienza aortica',
          testo: 'Il gonfiaggio diastolico aumenta il volume rigurgitante nel VS.',
        }
      : null,
  ({ b }) =>
    b.laMean > 25
      ? {
          id: 'edema',
          livello: 'attenzione',
          titolo: `PCWP ${b.laMean.toFixed(0)} mmHg: rischio di edema polmonare`,
          testo: 'Pressione idrostatica capillare oltre la pressione oncotica plasmatica.',
        }
      : null,
  ({ b }) =>
    b.qpqs > 0 && b.qpqs < 0.9
      ? {
          id: 'shunt-inverso',
          livello: 'attenzione',
          titolo: `Shunt destro→sinistro (Qp/Qs ${b.qpqs.toFixed(2)})`,
          testo: 'Sangue desaturato bypassa i polmoni: ipossiemia refrattaria all’O₂.',
        }
      : null,
];

export function valutaAvvisi(caseId: string | null, b: BeatMetrics, p: Params): Avviso[] {
  const out: Avviso[] = [];
  for (const r of REGOLE) {
    const a = r({ caseId, b, p });
    if (a) out.push(a);
  }
  const rank: Record<Livello, number> = { critico: 0, attenzione: 1, info: 2 };
  return out.sort((x, y) => rank[x.livello] - rank[y.livello]);
}
