/**
 * Test di direzione dei preset di patologia: a gravità massima (con baroriflesso attivo, come
 * nell'app) le grandezze chiave devono muoversi nella direzione attesa rispetto al normale, e in
 * modo monotono con la gravità.
 */
import { describe, expect, it } from 'vitest';
import { averageBeats, CardioEngine } from '@physiology/engine';
import type { BeatMetrics } from '@physiology/metrics';
import { applyPatch, type ParamsPatch } from '@physiology/params';
import { caseParams, PATHOLOGIES, PATHOLOGY_BY_ID, type Pathology } from '@pathologies/index';

interface Run {
  b: BeatMetrics;
  engine: CardioEngine;
}

const cache = new Map<string, Run>();
function run(id: string | null, s = 1, extra: ParamsPatch = {}, settle = 45): Run {
  const key = `${id}|${s}|${JSON.stringify(extra)}|${settle}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const params = caseParams(id ? PATHOLOGY_BY_ID[id]! : null, s);
  applyPatch(params, extra);
  const engine = new CardioEngine({ params });
  engine.advance(settle);
  const r = { b: averageBeats(engine, 12), engine };
  cache.set(key, r);
  return r;
}
const N = () => run(null).b;
const sev = (id: string) => run(id).b;

/** Direzione attesa per ciascun preset (b = grave, n = normale) + metrica monotona lieve → grave. */
const EXPECT: Record<
  string,
  { check: (b: BeatMetrics, n: BeatMetrics) => void; mono: (b: BeatMetrics) => number }
> = {
  'stenosi-aortica': {
    check: (b, n) => {
      expect(b.avMeanGradient).toBeGreaterThan(40);
      expect(b.lvSys).toBeGreaterThan(b.aoSys + 50);
      expect(b.evr).toBeLessThan(0.8 * n.evr);
      expect(b.lvEdp).toBeGreaterThan(n.lvEdp + 4);
    },
    mono: (b) => b.avMeanGradient,
  },
  'insufficienza-aortica': {
    check: (b, n) => {
      expect(b.arFraction).toBeGreaterThan(0.4);
      expect(b.aoDia).toBeLessThan(n.aoDia - 20);
      expect(b.aoSys - b.aoDia).toBeGreaterThan(n.aoSys - n.aoDia + 50);
      expect(b.lvEdv).toBeGreaterThan(n.lvEdv + 60);
    },
    mono: (b) => b.arFraction,
  },
  'stenosi-mitralica': {
    check: (b, n) => {
      expect(b.mvMeanGradient).toBeGreaterThan(10);
      expect(b.laMean).toBeGreaterThan(n.laMean + 8);
      expect(b.paMean).toBeGreaterThan(30);
      expect(b.lvEdv).toBeLessThan(n.lvEdv);
    },
    mono: (b) => b.mvMeanGradient,
  },
  'im-acuta': {
    check: (b, n) => {
      expect(b.mrFraction).toBeGreaterThan(0.4);
      expect(b.laMean).toBeGreaterThan(18);
      expect(b.laMax - b.laMean).toBeGreaterThan(n.laMax - n.laMean + 5); // onde v
      expect(b.co).toBeLessThan(n.co);
    },
    mono: (b) => b.laMean,
  },
  'im-cronica': {
    check: (b) => {
      const acute = sev('im-acuta');
      expect(b.mrFraction).toBeGreaterThan(0.4);
      // Stesso rigurgito, AS e VS dilatati e complianti: pressioni più basse, VS più grande
      expect(b.laMean).toBeLessThan(acute.laMean - 5);
      expect(b.laMax - b.laMean).toBeLessThan(acute.laMax - acute.laMean);
      expect(b.lvEdv).toBeGreaterThan(acute.lvEdv + 40);
    },
    mono: (b) => b.lvEdv,
  },
  'insufficienza-tricuspidale': {
    check: (b, n) => {
      expect(b.trFraction).toBeGreaterThan(0.4);
      expect(b.raMean).toBeGreaterThan(n.raMean + 3);
      expect(b.raMax - b.raMean).toBeGreaterThan(n.raMax - n.raMean);
    },
    mono: (b) => b.trFraction,
  },
  'stenosi-polmonare': {
    check: (b) => {
      expect(b.pvPeakGradient).toBeGreaterThan(64);
      expect(b.rvSys).toBeGreaterThan(b.paSys + 60);
    },
    mono: (b) => b.pvPeakGradient,
  },
  hfref: {
    check: (b, n) => {
      expect(b.ef).toBeLessThan(0.3);
      expect(b.lvEdv).toBeGreaterThan(200);
      expect(b.laMean).toBeGreaterThan(15);
      expect(b.co).toBeLessThan(n.co);
    },
    mono: (b) => -b.ef,
  },
  hfpef: {
    check: (b, n) => {
      expect(b.ef).toBeGreaterThan(0.5);
      expect(b.lvEdp).toBeGreaterThan(20);
      expect(b.laMean).toBeGreaterThan(15);
      expect(b.lvEdv).toBeLessThan(n.lvEdv);
    },
    mono: (b) => b.lvEdp,
  },
  hocm: {
    check: (b, n) => {
      expect(b.avPeakGradient).toBeGreaterThan(40);
      expect(b.ef).toBeGreaterThan(n.ef);
      expect(b.lvEdp).toBeGreaterThan(n.lvEdp + 5);
    },
    mono: (b) => b.avPeakGradient,
  },
  'infarto-vd': {
    check: (b, n) => {
      expect(b.raMean).toBeGreaterThan(b.laMean + 3);
      expect(b.raMean).toBeGreaterThan(n.raMean + 3);
      expect(b.co).toBeLessThan(n.co);
      expect(b.rvEf).toBeLessThan(0.35);
    },
    mono: (b) => b.raMean - b.laMean,
  },
  'infarto-anteriore': {
    check: (b, n) => {
      expect(b.ef).toBeLessThan(0.45);
      expect(b.laMean).toBeGreaterThan(18);
      expect(b.co).toBeLessThan(n.co);
      expect(b.hr).toBeGreaterThan(n.hr + 10);
    },
    mono: (b) => b.laMean,
  },
  tamponamento: {
    check: (b, n) => {
      expect(b.periMean).toBeGreaterThan(n.periMean + 8);
      // Equalizzazione delle pressioni diastoliche
      expect(Math.abs(b.raMean - b.laMean)).toBeLessThan(2);
      expect(Math.abs(b.rvEdp - b.lvEdp)).toBeLessThan(2);
      expect(b.co).toBeLessThan(0.6 * n.co);
      expect(b.hr).toBeGreaterThan(n.hr + 20);
    },
    mono: (b) => b.periMean,
  },
  'pericardite-costrittiva': {
    check: (b, n) => {
      expect(b.rvEdp).toBeGreaterThan(n.rvEdp + 5);
      expect(b.raMean).toBeGreaterThan(n.raMean + 3);
      expect(Math.abs(b.lvEdp - b.rvEdp)).toBeLessThan(5);
    },
    mono: (b) => b.rvEdp,
  },
  'embolia-polmonare': {
    check: (b, n) => {
      expect(b.paSys).toBeGreaterThan(35);
      expect(b.rvEdv).toBeGreaterThan(n.rvEdv + 20);
      expect(b.lvEdv).toBeLessThan(n.lvEdv - 20);
      expect(b.sptEd).toBeLessThan(n.sptEd); // setto spinto verso il VS
      expect(b.co).toBeLessThan(n.co);
    },
    mono: (b) => b.paMean,
  },
  'ipertensione-polmonare': {
    check: (b, n) => {
      expect(b.paMean).toBeGreaterThan(40);
      expect(b.rvSys).toBeGreaterThan(60);
      expect(b.laMean).toBeLessThan(n.laMean + 3); // pre-capillare
    },
    mono: (b) => b.paMean,
  },
  'shock-ipovolemico': {
    check: (b, n) => {
      expect(b.aoMean).toBeLessThan(n.aoMean - 20);
      expect(b.hr).toBeGreaterThan(n.hr + 30);
      expect(b.raMean).toBeLessThan(n.raMean - 3);
      expect(b.co).toBeLessThan(0.6 * n.co);
      expect(b.svr).toBeGreaterThan(n.svr);
    },
    mono: (b) => -b.aoMean,
  },
  'shock-settico': {
    check: (b, n) => {
      expect(b.svr).toBeLessThan(0.6 * n.svr);
      expect(b.co).toBeGreaterThan(n.co);
      expect(b.aoMean).toBeLessThan(75);
      expect(b.svo2).toBeGreaterThan(n.svo2);
    },
    mono: (b) => -b.svr,
  },
  'shock-cardiogeno': {
    check: (b, n) => {
      expect(b.co).toBeLessThan(3.5);
      expect(b.laMean).toBeGreaterThan(25);
      expect(b.aoMean).toBeLessThan(85);
      expect(b.svr).toBeGreaterThan(n.svr);
      expect(b.svo2).toBeLessThan(n.svo2 - 0.1);
    },
    mono: (b) => b.laMean,
  },
  'shock-ostruttivo': {
    check: (b, n) => {
      expect(b.co).toBeLessThan(2.5);
      expect(b.raMean).toBeGreaterThan(n.raMean + 5);
      expect(b.lvEdv).toBeLessThan(0.5 * n.lvEdv);
      expect(b.aoMean).toBeLessThan(65);
    },
    mono: (b) => -b.co,
  },
  dia: {
    check: (b, n) => {
      expect(b.qpqs).toBeGreaterThan(1.8);
      expect(b.asdVolume).toBeGreaterThan(0);
      expect(b.rvEdv).toBeGreaterThan(n.rvEdv + 20);
    },
    mono: (b) => b.qpqs,
  },
  div: {
    check: (b, n) => {
      expect(b.qpqs).toBeGreaterThan(2.5);
      expect(b.vsdVolume).toBeGreaterThan(0);
      expect(b.lvEdv).toBeGreaterThan(n.lvEdv);
      expect(b.laMean).toBeGreaterThan(n.laMean);
    },
    mono: (b) => b.qpqs,
  },
  pda: {
    check: (b, n) => {
      expect(b.qpqs).toBeGreaterThan(2.5);
      expect(b.pdaVolume).toBeGreaterThan(0);
      expect(b.aoDia).toBeLessThan(n.aoDia - 15);
      expect(b.lvEdv).toBeGreaterThan(n.lvEdv + 20);
    },
    mono: (b) => b.qpqs,
  },
  fa: {
    check: (b, n) => {
      expect(b.hr).toBeGreaterThan(n.hr + 40);
      expect(b.lvEdv).toBeLessThan(n.lvEdv);
    },
    mono: (b) => b.hr,
  },
  bradicardia: {
    check: (b, n) => {
      expect(b.hr).toBeLessThan(35);
      expect(b.lvEdv).toBeGreaterThan(n.lvEdv);
      expect(b.co).toBeLessThan(0.7 * n.co);
    },
    mono: (b) => -b.hr,
  },
  tachicardia: {
    check: (b, n) => {
      expect(b.hr).toBeGreaterThan(180);
      expect(b.lvEdv).toBeLessThan(n.lvEdv - 30);
      expect(b.forwardSv).toBeLessThan(0.5 * n.forwardSv);
      expect(b.evr).toBeLessThan(0.5 * n.evr);
    },
    mono: (b) => b.hr,
  },
  bav3: {
    check: (b, n) => {
      expect(Math.abs(b.hr - 25)).toBeLessThan(3);
      expect(b.co).toBeLessThan(0.6 * n.co);
      expect(b.lvEdv).toBeGreaterThan(n.lvEdv);
    },
    mono: (b) => -b.hr,
  },
};

describe('preset delle patologie', () => {
  it('ogni patologia ha un test di direzione e una scheda completa', () => {
    for (const p of PATHOLOGIES) {
      expect(EXPECT[p.id], p.id).toBeDefined();
      const o = p.scheda.obiettivi;
      for (const g of [o.fc, o.precarico, o.postcarico, o.contrattilita])
        expect(g.target.length).toBeGreaterThan(2);
      expect(p.scheda.fisiopatologia.length).toBeGreaterThan(100);
      expect(p.gravita(0)).not.toEqual(p.gravita(1));
    }
  });

  for (const p of PATHOLOGIES as Pathology[]) {
    it(`${p.nome}: direzione emodinamica attesa e monotonia con la gravità`, () => {
      const b = sev(p.id);
      for (const v of Object.values(b)) expect(Number.isFinite(v)).toBe(true);
      EXPECT[p.id]!.check(b, N());
      const mono = EXPECT[p.id]!.mono;
      expect(mono(run(p.id, 0).b)).toBeLessThan(mono(b));
    });
  }
});

describe('fisiologia dinamica', () => {
  it('CMIO: l’ostruzione peggiora con inotropi e ipovolemia, migliora con volume e vasocostrittore', () => {
    const base = run('hocm', 0.5).b.avPeakGradient;
    const dobu = run('hocm', 0.5, { drugs: { dobutamine: 10 } }, 300).b.avPeakGradient;
    const hypo = run('hocm', 0.5, { bloodVolume: 4000 }).b.avPeakGradient;
    const treated = run('hocm', 0.5, { bloodVolume: 5600, drugs: { noradrenaline: 0.1, esmolol: 150 } }, 300)
      .b.avPeakGradient;
    expect(dobu).toBeGreaterThan(base + 15);
    expect(hypo).toBeGreaterThan(base + 8);
    expect(treated).toBeLessThan(base - 10);
  });

  it('fibrillazione atriale: gittata variabile battito per battito', () => {
    const sv = (id: string | null, extra: ParamsPatch) => {
      const { engine } = run(id, 1, extra);
      const vals: number[] = [];
      let last = engine.beatCount;
      while (vals.length < 30) {
        engine.step();
        if (engine.beatCount !== last) {
          last = engine.beatCount;
          vals.push(engine.lastBeat.forwardSv);
        }
      }
      const m = vals.reduce((a, x) => a + x, 0) / vals.length;
      return Math.sqrt(vals.reduce((a, x) => a + (x - m) ** 2, 0) / vals.length) / m;
    };
    expect(sv('fa', {})).toBeGreaterThan(0.08);
    expect(sv(null, { ventilation: { mode: 'apnea' } })).toBeLessThan(0.03);
  });

  it('BAV III: onde a "a cannone" nella pressione atriale destra', () => {
    const maxRa = (id: string | null) => {
      const { engine } = run(id, 1, {}, 44);
      let m = -Infinity;
      let last = engine.beatCount;
      for (let n = 0; n < 12;) {
        engine.step();
        if (engine.beatCount !== last) {
          last = engine.beatCount;
          n++;
          m = Math.max(m, engine.lastBeat.raMax);
        }
      }
      return m;
    };
    expect(maxRa('bav3')).toBeGreaterThan(maxRa(null) + 2);
  });

  it('tamponamento: pericardiocentesi ripristina la gittata', () => {
    const { engine } = run('tamponamento', 1, {}, 44);
    const co0 = engine.lastBeat.co;
    engine.setParams({ pericardium: { effusion: 0 } });
    engine.advance(60);
    expect(engine.lastBeat.co).toBeGreaterThan(co0 + 1.5);
  });

  it('tamponamento: il polso paradosso aumenta con il versamento', () => {
    const resp = (s: number) => run('tamponamento', s).engine.lastResp.sbpVariation;
    expect(resp(1)).toBeGreaterThan(resp(0) + 3);
  });
});
