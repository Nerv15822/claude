/**
 * Metriche battito-battito e respiro-respiro calcolate a partire dai campioni del motore.
 * Nessuna allocazione durante l'accumulo: gli oggetti risultato sono riutilizzati.
 */
import { A, S } from './model';
import type { Params } from './params';

export interface BeatMetrics {
  /** Numero progressivo del battito */
  index: number;
  /** Durata del battito (s) e FC ventricolare effettiva (bpm) */
  duration: number;
  hr: number;
  // Pressioni sistemiche
  aoSys: number;
  aoDia: number;
  aoMean: number;
  // Ventricolo sinistro
  lvSys: number;
  lvEdp: number;
  lvEdv: number;
  lvEsv: number;
  /** Gittata sistolica totale (EDV − ESV), mL */
  lvSv: number;
  /** Gittata anterograda netta attraverso la valvola aortica, mL */
  forwardSv: number;
  ef: number;
  /** Lavoro sistolico dall'area del loop PV (mmHg·mL) */
  strokeWork: number;
  // Ventricolo destro
  rvSys: number;
  rvEdp: number;
  rvEdv: number;
  rvEsv: number;
  rvEf: number;
  // Polmonare
  paSys: number;
  paDia: number;
  paMean: number;
  // Atri
  laMean: number;
  raMean: number;
  laMax: number;
  raMax: number;
  /** Gittata cardiaca sistemica (L/min) */
  co: number;
  /** Qp/Qs */
  qpqs: number;
  // Gradienti transvalvolari (mmHg) e frazioni di rigurgito (0–1)
  avMeanGradient: number;
  avPeakGradient: number;
  mvMeanGradient: number;
  tvMeanGradient: number;
  pvMeanGradient: number;
  pvPeakGradient: number;
  mrFraction: number;
  arFraction: number;
  trFraction: number;
  prFraction: number;
  /** Volume netto di shunt nel battito (mL, positivo sinistro→destro) */
  asdVolume: number;
  vsdVolume: number;
  pdaVolume: number;
  /** Pressione pericardica media (mmHg, assoluta) */
  periMean: number;
  /** Resistenze calcolate (dyn·s·cm⁻⁵) */
  svr: number;
  pvr: number;
  /** SvO2 stimata (Fick semplificato), 0–1 */
  svo2: number;
}

export interface RespMetrics {
  index: number;
  /** Pulse pressure variation (%) */
  ppv: number;
  /** Stroke volume variation (%) */
  svv: number;
  /** Escursione della sistolica nel ciclo respiratorio (mmHg): polso paradosso se in spontaneo */
  sbpVariation: number;
  beats: number;
}

export function emptyBeatMetrics(): BeatMetrics {
  return {
    index: 0,
    duration: 0,
    hr: 0,
    aoSys: 0,
    aoDia: 0,
    aoMean: 0,
    lvSys: 0,
    lvEdp: 0,
    lvEdv: 0,
    lvEsv: 0,
    lvSv: 0,
    forwardSv: 0,
    ef: 0,
    strokeWork: 0,
    rvSys: 0,
    rvEdp: 0,
    rvEdv: 0,
    rvEsv: 0,
    rvEf: 0,
    paSys: 0,
    paDia: 0,
    paMean: 0,
    laMean: 0,
    raMean: 0,
    laMax: 0,
    raMax: 0,
    co: 0,
    qpqs: 1,
    avMeanGradient: 0,
    avPeakGradient: 0,
    mvMeanGradient: 0,
    tvMeanGradient: 0,
    pvMeanGradient: 0,
    pvPeakGradient: 0,
    mrFraction: 0,
    arFraction: 0,
    trFraction: 0,
    prFraction: 0,
    asdVolume: 0,
    vsdVolume: 0,
    pdaVolume: 0,
    periMean: 0,
    svr: 0,
    pvr: 0,
    svo2: 0,
  };
}

export function emptyRespMetrics(): RespMetrics {
  return { index: 0, ppv: 0, svv: 0, sbpVariation: 0, beats: 0 };
}

/** Accumulatore del battito corrente. */
export class BeatAnalyzer {
  readonly last: BeatMetrics = emptyBeatMetrics();
  private started = false;
  private time = 0;
  private aoMax = -Infinity;
  private aoMin = Infinity;
  private aoInt = 0;
  private lvMax = -Infinity;
  private lvVmax = -Infinity;
  private lvVmin = Infinity;
  private rvMax = -Infinity;
  private rvVmax = -Infinity;
  private rvVmin = Infinity;
  private paMax = -Infinity;
  private paMin = Infinity;
  private paInt = 0;
  private laInt = 0;
  private raInt = 0;
  private laMax = -Infinity;
  private raMax = -Infinity;
  private periInt = 0;
  private svInt = 0;
  private qsysInt = 0;
  private qpulmInt = 0;
  private lvEdp = 0;
  private rvEdp = 0;
  private sw = 0;
  private prevVlv = NaN;
  private prevPlv = 0;
  private avFwd = 0;
  private avBack = 0;
  private mvFwd = 0;
  private mvBack = 0;
  private tvFwd = 0;
  private tvBack = 0;
  private pvFwd = 0;
  private pvBack = 0;
  private avGradInt = 0;
  private avGradTime = 0;
  private avGradPeak = 0;
  private mvGradInt = 0;
  private mvGradTime = 0;
  private tvGradInt = 0;
  private tvGradTime = 0;
  private pvGradInt = 0;
  private pvGradTime = 0;
  private pvGradPeak = 0;
  private asd = 0;
  private vsd = 0;
  private pda = 0;

  /** Inizio di un nuovo battito (QRS). Ritorna true se un battito completo è stato finalizzato. */
  onQrs(y: Float64Array, aux: Float64Array, p: Params): boolean {
    let finalized = false;
    if (this.started && this.time > 0.15) {
      this.finalize(p);
      finalized = true;
    }
    this.reset();
    this.lvEdp = aux[A.P_LV]!;
    this.rvEdp = aux[A.P_RV]!;
    this.prevVlv = y[S.V_LV]!;
    this.prevPlv = aux[A.P_LV]!;
    this.started = true;
    return finalized;
  }

  private reset(): void {
    this.time = 0;
    this.aoMax = this.lvMax = this.rvMax = this.paMax = this.laMax = this.raMax = -Infinity;
    this.lvVmax = this.rvVmax = -Infinity;
    this.aoMin = this.paMin = this.lvVmin = this.rvVmin = Infinity;
    this.aoInt = this.paInt = this.laInt = this.raInt = this.periInt = this.svInt = 0;
    this.qsysInt = this.qpulmInt = this.sw = 0;
    this.avFwd = this.avBack = this.mvFwd = this.mvBack = 0;
    this.tvFwd = this.tvBack = this.pvFwd = this.pvBack = 0;
    this.avGradInt = this.avGradTime = this.avGradPeak = 0;
    this.mvGradInt = this.mvGradTime = this.tvGradInt = this.tvGradTime = 0;
    this.pvGradInt = this.pvGradTime = this.pvGradPeak = 0;
    this.asd = this.vsd = this.pda = 0;
  }

  /** Accumula un passo di integrazione (dt) con lo stato risultante. */
  accumulate(dt: number, y: Float64Array, aux: Float64Array): void {
    if (!this.started) return;
    this.time += dt;
    const pao = aux[A.P_AO]!;
    const plv = aux[A.P_LV]!;
    const prv = aux[A.P_RV]!;
    const ppa = aux[A.P_PA_PROX]!;
    const pla = aux[A.P_LA]!;
    const pra = aux[A.P_RA]!;
    const vlv = y[S.V_LV]!;
    const vrv = y[S.V_RV]!;
    if (pao > this.aoMax) this.aoMax = pao;
    if (pao < this.aoMin) this.aoMin = pao;
    if (plv > this.lvMax) this.lvMax = plv;
    if (prv > this.rvMax) this.rvMax = prv;
    if (ppa > this.paMax) this.paMax = ppa;
    if (ppa < this.paMin) this.paMin = ppa;
    if (pla > this.laMax) this.laMax = pla;
    if (pra > this.raMax) this.raMax = pra;
    if (vlv > this.lvVmax) this.lvVmax = vlv;
    if (vlv < this.lvVmin) this.lvVmin = vlv;
    if (vrv > this.rvVmax) this.rvVmax = vrv;
    if (vrv < this.rvVmin) this.rvVmin = vrv;
    this.aoInt += pao * dt;
    this.paInt += ppa * dt;
    this.laInt += pla * dt;
    this.raInt += pra * dt;
    this.periInt += aux[A.P_PERI]! * dt;
    this.svInt += aux[A.P_SV]! * dt;
    this.qsysInt += aux[A.Q_SYS]! * dt;
    this.qpulmInt += aux[A.Q_PULM]! * dt;
    // Lavoro sistolico: −∮P dV (regola del trapezio)
    this.sw -= 0.5 * (plv + this.prevPlv) * (vlv - this.prevVlv);
    this.prevVlv = vlv;
    this.prevPlv = plv;

    const qav = y[S.Q_AV]!;
    const qmv = y[S.Q_MV]!;
    const qtv = y[S.Q_TV]!;
    const qpv = y[S.Q_PV]!;
    if (qav > 0) {
      this.avFwd += qav * dt;
      const g = plv - pao;
      this.avGradInt += g * dt;
      this.avGradTime += dt;
      if (g > this.avGradPeak) this.avGradPeak = g;
    } else this.avBack -= qav * dt;
    if (qmv > 0) {
      this.mvFwd += qmv * dt;
      this.mvGradInt += (pla - plv) * dt;
      this.mvGradTime += dt;
    } else this.mvBack -= qmv * dt;
    if (qtv > 0) {
      this.tvFwd += qtv * dt;
      this.tvGradInt += (pra - prv) * dt;
      this.tvGradTime += dt;
    } else this.tvBack -= qtv * dt;
    if (qpv > 0) {
      this.pvFwd += qpv * dt;
      const g = prv - ppa;
      this.pvGradInt += g * dt;
      this.pvGradTime += dt;
      if (g > this.pvGradPeak) this.pvGradPeak = g;
    } else this.pvBack -= qpv * dt;
    this.asd += y[S.Q_ASD]! * dt;
    this.vsd += y[S.Q_VSD]! * dt;
    this.pda += y[S.Q_PDA]! * dt;
  }

  private finalize(p: Params): void {
    const m = this.last;
    const T = this.time;
    m.index += 1;
    m.duration = T;
    m.hr = 60 / T;
    m.aoSys = this.aoMax;
    m.aoDia = this.aoMin;
    m.aoMean = this.aoInt / T;
    m.lvSys = this.lvMax;
    m.lvEdp = this.lvEdp;
    m.lvEdv = this.lvVmax;
    m.lvEsv = this.lvVmin;
    m.lvSv = this.lvVmax - this.lvVmin;
    m.forwardSv = this.avFwd - this.avBack;
    m.ef = m.lvSv / this.lvVmax;
    m.strokeWork = this.sw;
    m.rvSys = this.rvMax;
    m.rvEdp = this.rvEdp;
    m.rvEdv = this.rvVmax;
    m.rvEsv = this.rvVmin;
    m.rvEf = (this.rvVmax - this.rvVmin) / this.rvVmax;
    m.paSys = this.paMax;
    m.paDia = this.paMin;
    m.paMean = this.paInt / T;
    m.laMean = this.laInt / T;
    m.raMean = this.raInt / T;
    m.laMax = this.laMax;
    m.raMax = this.raMax;
    m.periMean = this.periInt / T;
    const qs = this.qsysInt / T; // mL/s
    const qp = this.qpulmInt / T;
    m.co = (qs * 60) / 1000;
    m.qpqs = qs > 0 ? qp / qs : 0;
    m.avMeanGradient = this.avGradTime > 0 ? this.avGradInt / this.avGradTime : 0;
    m.avPeakGradient = this.avGradPeak;
    m.mvMeanGradient = this.mvGradTime > 0 ? this.mvGradInt / this.mvGradTime : 0;
    m.tvMeanGradient = this.tvGradTime > 0 ? this.tvGradInt / this.tvGradTime : 0;
    m.pvMeanGradient = this.pvGradTime > 0 ? this.pvGradInt / this.pvGradTime : 0;
    m.pvPeakGradient = this.pvGradPeak;
    m.mrFraction =
      this.mvBack > 0 && this.avFwd + this.mvBack > 0 ? this.mvBack / (this.avFwd + this.mvBack) : 0;
    m.arFraction = this.avFwd > 0 ? this.avBack / this.avFwd : 0;
    m.trFraction =
      this.tvBack > 0 && this.pvFwd + this.tvBack > 0 ? this.tvBack / (this.pvFwd + this.tvBack) : 0;
    m.prFraction = this.pvFwd > 0 ? this.pvBack / this.pvFwd : 0;
    m.asdVolume = this.asd;
    m.vsdVolume = this.vsd;
    m.pdaVolume = this.pda;
    const svMean = this.svInt / T;
    m.svr = qs > 0 ? ((m.aoMean - svMean) / qs) * 1333.22 : 0;
    m.pvr = qp > 0 ? ((m.paMean - m.laMean) / qp) * 1333.22 : 0;
    const o = p.oxygen;
    m.svo2 = m.co > 0 ? Math.max(0, o.sao2 - o.vo2 / (m.co * 13.4 * o.hb)) : 0;
  }
}

/** Metriche per ciclo respiratorio (PPV, SVV, variazione della sistolica). */
export class RespAnalyzer {
  readonly last: RespMetrics = emptyRespMetrics();
  private ppMax = -Infinity;
  private ppMin = Infinity;
  private ppSum = 0;
  private svMax = -Infinity;
  private svMin = Infinity;
  private svSum = 0;
  private sbpMax = -Infinity;
  private sbpMin = Infinity;
  private n = 0;
  /** Media mobile su 3 cicli */
  private readonly hist = new Float64Array(9);
  private histCount = 0;

  onBeat(b: BeatMetrics): void {
    const pp = b.aoSys - b.aoDia;
    if (pp > this.ppMax) this.ppMax = pp;
    if (pp < this.ppMin) this.ppMin = pp;
    this.ppSum += pp;
    const sv = b.forwardSv;
    if (sv > this.svMax) this.svMax = sv;
    if (sv < this.svMin) this.svMin = sv;
    this.svSum += sv;
    if (b.aoSys > this.sbpMax) this.sbpMax = b.aoSys;
    if (b.aoSys < this.sbpMin) this.sbpMin = b.aoSys;
    this.n++;
  }

  /** Fine di un ciclo respiratorio. Ritorna true se le metriche sono state aggiornate. */
  onCycleEnd(): boolean {
    let updated = false;
    if (this.n >= 2) {
      const ppv = (100 * (this.ppMax - this.ppMin)) / ((this.ppMax + this.ppMin) / 2);
      const svv = (100 * (this.svMax - this.svMin)) / (this.svSum / this.n);
      const dsbp = this.sbpMax - this.sbpMin;
      const slot = (this.histCount % 3) * 3;
      this.hist[slot] = ppv;
      this.hist[slot + 1] = svv;
      this.hist[slot + 2] = dsbp;
      this.histCount++;
      const k = Math.min(this.histCount, 3);
      let a = 0;
      let b = 0;
      let c = 0;
      for (let i = 0; i < k; i++) {
        a += this.hist[i * 3]!;
        b += this.hist[i * 3 + 1]!;
        c += this.hist[i * 3 + 2]!;
      }
      const m = this.last;
      m.index += 1;
      m.ppv = a / k;
      m.svv = b / k;
      m.sbpVariation = c / k;
      m.beats = this.n;
      updated = true;
    }
    this.ppMax = this.svMax = this.sbpMax = -Infinity;
    this.ppMin = this.svMin = this.sbpMin = Infinity;
    this.ppSum = this.svSum = 0;
    this.n = 0;
    return updated;
  }
}
