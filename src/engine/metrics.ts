/**
 * Emodinamica — metriche emodinamiche derivate, finalizzate a ogni battito.
 *
 * L'analizzatore accumula i campioni (a passo dt) e, all'arrivo del QRS successivo,
 * calcola le grandezze per battito: pressioni min/max e medie, volumi tele(dia/sisto)lici,
 * SV, CO, elastanze, lavoro, MSFP, volume stressato, flussi regionali. La variabilità
 * respiratoria (PPV/SVV) è calcolata su un ciclo respiratorio dal RespAnalyzer.
 */
import { DISTRICT_COUNT } from './districts';
import { A } from './model';
import type { Params } from './params';
import { mlsToLmin, resistanceToDyn, resistanceToWood } from './units';

export interface BeatMetrics {
  /** s dall'inizio della simulazione (istante di finalizzazione) */
  t: number;
  hr: number;
  /** Gittata cardiaca (L/min) */
  co: number;
  /** Gittata sistolica del VS (mL) */
  sv: number;
  /** Gittata sistolica del VD (mL) */
  svRv: number;
  /** Pressione arteriosa media (mmHg) */
  map: number;
  /** Pressione arteriosa sistolica / diastolica (mmHg) */
  pas: number;
  pad: number;
  /** Pressione venosa centrale, media AD (mmHg) */
  cvp: number;
  /** Pressione arteria polmonare sistolica / diastolica / media (mmHg) */
  paps: number;
  papd: number;
  papm: number;
  /** Pressione di occlusione (≈ PCWP), media AS (mmHg) */
  paop: number;
  /** Resistenza vascolare sistemica (dyn·s·cm⁻⁵) */
  svr: number;
  /** Resistenza vascolare polmonare (dyn·s·cm⁻⁵ e unità Wood) */
  pvr: number;
  pvrWood: number;
  lvedv: number;
  lvesv: number;
  lvef: number;
  rvedv: number;
  rvesv: number;
  rvef: number;
  /** Elastanza arteriosa Ea = P_telesistolica / SV (mmHg/mL) */
  ea: number;
  /** Elastanza telesistolica del VS (mmHg/mL) */
  ees: number;
  eaOverEes: number;
  /** Pressione di riempimento sistemico medio (mmHg) */
  msfp: number;
  /** Volume stressato sistemico (mL) */
  stressedVolume: number;
  /** Lavoro esterno del VS (J/battito) */
  externalWork: number;
  /** Area pressione-volume (J/battito) — lavoro esterno + energia potenziale */
  pva: number;
  /** Pressione di perfusione coronarica = PAD_aortica − PTD_VS (mmHg) */
  cpp: number;
  /** Ritorno venoso medio (L/min) — a regime uguale alla CO */
  venousReturn: number;
  /** Flusso di ciascun distretto (L/min) */
  districtFlow: number[];
  /** Frazione di gittata di ciascun distretto */
  districtFraction: number[];
  /** Variazione di pressione di polso (%) — riempito dal RespAnalyzer */
  ppv: number;
  /** Variazione di gittata sistolica (%) — riempito dal RespAnalyzer */
  svv: number;
}

export function emptyBeat(): BeatMetrics {
  return {
    t: 0,
    hr: 0,
    co: 0,
    sv: 0,
    svRv: 0,
    map: 0,
    pas: 0,
    pad: 0,
    cvp: 0,
    paps: 0,
    papd: 0,
    papm: 0,
    paop: 0,
    svr: 0,
    pvr: 0,
    pvrWood: 0,
    lvedv: 0,
    lvesv: 0,
    lvef: 0,
    rvedv: 0,
    rvesv: 0,
    rvef: 0,
    ea: 0,
    ees: 0,
    eaOverEes: 0,
    msfp: 0,
    stressedVolume: 0,
    externalWork: 0,
    pva: 0,
    cpp: 0,
    venousReturn: 0,
    districtFlow: new Array(DISTRICT_COUNT).fill(0),
    districtFraction: new Array(DISTRICT_COUNT).fill(0),
    ppv: 0,
    svv: 0,
  };
}

/** mmHg·mL → Joule: 1 mmHg·mL = 133.322 Pa · 1e-6 m³ = 1.33322e-4 J */
const MMHG_ML_TO_J = 133.322e-6;

export class BeatAnalyzer {
  private dur = 0;
  private sumPao = 0;
  private sumPra = 0;
  private sumPla = 0;
  private sumPpa = 0;
  private maxPao = -1e9;
  private minPao = 1e9;
  private maxPpa = -1e9;
  private minPpa = 1e9;
  private maxVlv = -1e9;
  private minVlv = 1e9;
  private maxVrv = -1e9;
  private minVrv = 1e9;
  private padAortic = 1e9; // diastolica aortica = minimo di P_AO
  private paoAtEsv = 0; // pressione aortica alla telesistole (volume VS minimo)
  private prevVlv = 0;
  private sumDistrict = new Float64Array(DISTRICT_COUNT);
  private sumQsys = 0;
  private sumQvr = 0;
  private workAccum = 0; // ∮ P_LV dV  (mmHg·mL)
  private lvedpAtEdv = 0;
  private hasPrev = false;

  reset(_t: number): void {
    this.dur = 0;
    this.sumPao = this.sumPra = this.sumPla = this.sumPpa = 0;
    this.maxPao = this.maxPpa = this.maxVlv = this.maxVrv = -1e9;
    this.minPao = this.minPpa = this.minVlv = this.minVrv = 1e9;
    this.padAortic = 1e9;
    this.paoAtEsv = 0;
    this.sumDistrict.fill(0);
    this.sumQsys = this.sumQvr = 0;
    this.workAccum = 0;
    this.hasPrev = false;
  }

  /** Accumula un campione (aux allo stato corrente, più flussi di distretto dal contesto). */
  sample(dt: number, aux: Float64Array, vlv: number, vrv: number, districtFlow: Float64Array): void {
    this.dur += dt;
    const pao = aux[A.P_AO]!;
    const plv = aux[A.P_LV]!;
    this.sumPao += pao * dt;
    this.sumPra += aux[A.P_RA]! * dt;
    this.sumPla += aux[A.P_LA]! * dt;
    this.sumPpa += aux[A.P_PA_PROX]! * dt;
    if (pao > this.maxPao) this.maxPao = pao;
    if (pao < this.minPao) this.minPao = pao;
    const ppa = aux[A.P_PA_PROX]!;
    if (ppa > this.maxPpa) this.maxPpa = ppa;
    if (ppa < this.minPpa) this.minPpa = ppa;
    if (vlv > this.maxVlv) {
      // Primo raggiungimento del volume massimo = fine del riempimento: qui P_LV è la PTD.
      this.maxVlv = vlv;
      this.lvedpAtEdv = plv;
    }
    if (vlv < this.minVlv) this.minVlv = vlv;
    if (vrv > this.maxVrv) this.maxVrv = vrv;
    if (vrv < this.minVrv) this.minVrv = vrv;
    if (pao < this.padAortic) this.padAortic = pao;
    if (vlv <= this.minVlv + 1e-9) this.paoAtEsv = pao;
    // Lavoro esterno: ∮ P_LV dV (il segno rende positivo il lavoro di eiezione).
    if (this.hasPrev) {
      this.workAccum += plv * (vlv - this.prevVlv);
    }
    this.prevVlv = vlv;
    this.hasPrev = true;
    for (let i = 0; i < DISTRICT_COUNT; i++) this.sumDistrict[i]! += districtFlow[i]! * dt;
    this.sumQsys += aux[A.Q_SYS]! * dt;
    this.sumQvr += aux[A.Q_VR]! * dt;
  }

  /** Finalizza il battito e scrive le metriche in `out`. */
  finalize(p: Params, rr: number, out: BeatMetrics, t: number): void {
    const dur = this.dur > 1e-6 ? this.dur : 1e-6;
    const hr = 60 / Math.max(rr, 1e-3);
    out.t = t;
    out.hr = hr;
    const sv = this.maxVlv - this.minVlv;
    const svRv = this.maxVrv - this.minVrv;
    out.sv = sv;
    out.svRv = svRv;
    // CO calcolata dal flusso aortico medio (più robusta dell'SV·FC in ritmi irregolari).
    const coFromFlow = mlsToLmin(this.sumQsys / dur);
    out.co = coFromFlow;
    out.venousReturn = mlsToLmin(this.sumQvr / dur);
    out.map = this.sumPao / dur;
    out.pas = this.maxPao;
    out.pad = this.minPao;
    out.cvp = this.sumPra / dur;
    out.paps = this.maxPpa;
    out.papd = this.minPpa;
    out.papm = this.sumPpa / dur;
    out.paop = this.sumPla / dur;
    out.lvedv = this.maxVlv;
    out.lvesv = this.minVlv;
    out.lvef = this.maxVlv > 0 ? (sv / this.maxVlv) * 100 : 0;
    out.rvedv = this.maxVrv;
    out.rvesv = this.minVrv;
    out.rvef = this.maxVrv > 0 ? (svRv / this.maxVrv) * 100 : 0;

    const coMls = this.sumQsys / dur; // mL/s
    // SVR = (MAP − CVP) / CO ; PVR = (PAPm − PAOP) / Qp
    const svrInternal = coMls > 1e-6 ? (out.map - out.cvp) / coMls : 0;
    out.svr = resistanceToDyn(svrInternal);
    const pvrInternal = coMls > 1e-6 ? (out.papm - out.paop) / coMls : 0;
    out.pvr = resistanceToDyn(pvrInternal);
    out.pvrWood = resistanceToWood(pvrInternal);

    out.ees = p.lv.ees;
    // Ea = pressione telesistolica / SV (P_es ≈ pressione aortica al volume VS minimo).
    const esp = this.paoAtEsv > 0 ? this.paoAtEsv : out.map;
    out.ea = sv > 1e-6 ? esp / sv : 0;
    out.eaOverEes = out.ees > 1e-6 ? out.ea / out.ees : 0;

    // ∮ P_LV dV percorso nel verso fisiologico del loop è negativo: il lavoro esterno è il suo opposto.
    out.externalWork = -this.workAccum * MMHG_ML_TO_J;
    // PVA ≈ lavoro esterno + energia potenziale del triangolo ESPVR (stima).
    const peTriangle = 0.5 * p.lv.ees * (this.minVlv - p.lv.vd) * out.map;
    out.pva = out.externalWork + Math.max(peTriangle, 0) * MMHG_ML_TO_J;

    out.cpp = this.padAortic - this.lvedpAtEdv;

    for (let i = 0; i < DISTRICT_COUNT; i++) {
      out.districtFlow[i] = mlsToLmin(this.sumDistrict[i]! / dur);
    }
    const totalFlow = out.districtFlow.reduce((a, b) => a + b, 0);
    for (let i = 0; i < DISTRICT_COUNT; i++) {
      out.districtFraction[i] = totalFlow > 1e-6 ? out.districtFlow[i]! / totalFlow : 0;
    }
  }

  /** MSFP e volume stressato dallo stato corrente dei volumi (chiamato dall'engine). */
  static fillFilling(p: Params, vSA: number, vSV: number, out: BeatMetrics): void {
    const sys = p.systemic;
    const stressedArt = vSA - sys.va0;
    const stressedVen = vSV - sys.vv0;
    out.stressedVolume = stressedArt + stressedVen;
    out.msfp = out.stressedVolume / (sys.ca + sys.cv);
  }
}
