/**
 * Emodinamica — motore: integra il modello a passo fisso (RK4, dt = 1 ms) e produce
 * le metriche per battito. Il tempo reale è gestito dal chiamante (sub-stepping nel worker).
 *
 * Il motore è TypeScript puro: nessun import da React/three/zustand/scene/ui.
 * I modulatori (farmaci, baroriflesso, pH, temperatura…) sono iniettati tramite un hook
 * `modulate` che, a ogni battito, aggiorna i parametri EFFETTIVI e il tono dei distretti;
 * in Fase 1 il hook è l'identità (nessuna modulazione).
 */
import { DISTRICT_COUNT } from './districts';
import { BeatAnalyzer, type BeatMetrics, emptyBeat } from './metrics';
import { AUX_SIZE, S, STATE_SIZE, clampValves, evaluate, newEvalContext, type EvalContext } from './model';
import { type Params, cloneParams, defaultParams } from './params';
import { RhythmScheduler } from './rhythm';
import { computeVentilation, newVentilationState, type VentilationState } from './ventilation';

export const DT = 0.001; // 1 ms

/** Interfaccia di un modulatore: aggiorna i parametri effettivi e il tono dei distretti. */
export interface Modulator {
  /** Chiamato una volta per battito (al QRS) con lo stato corrente. */
  onBeat?(engine: CardioEngine, beat: BeatMetrics): void;
  /** Chiamato a ogni passo: può scrivere ctx.districtTone e modificare effParams. */
  onStep?(engine: CardioEngine, dt: number): void;
}

function initialState(p: Params): Float64Array {
  const y = new Float64Array(STATE_SIZE);
  // Volumi iniziali plausibili; il transitorio li porta a regime in pochi secondi.
  y[S.V_LA] = 60;
  y[S.V_LV] = 120;
  y[S.V_RA] = 60;
  y[S.V_RV] = 130;
  y[S.V_SA] = p.systemic.va0 + 110;
  y[S.V_PA] = p.pulmonary.va0 + 40;
  y[S.V_PV] = p.pulmonary.vv0 + 120;
  // Il resto del volume ematico va nel serbatoio venoso sistemico.
  let used = 0;
  for (let i = 0; i < 8; i++) used += y[i]!;
  y[S.V_SV] = p.bloodVolume - used;
  return y;
}

export class CardioEngine {
  /** Parametri obiettivo/base (quelli impostati dall'utente/preset). */
  params: Params;
  /** Parametri EFFETTIVI usati nell'integrazione (base × modulatori). */
  effParams: Params;
  y: Float64Array;
  aux: Float64Array;
  t = 0;

  private dy1 = new Float64Array(STATE_SIZE);
  private dy2 = new Float64Array(STATE_SIZE);
  private dy3 = new Float64Array(STATE_SIZE);
  private dy4 = new Float64Array(STATE_SIZE);
  private ytmp = new Float64Array(STATE_SIZE);
  private auxTmp = new Float64Array(AUX_SIZE);
  private vent: VentilationState;
  private scheduler: RhythmScheduler;
  private ctx: EvalContext;
  private analyzer = new BeatAnalyzer();
  private beat: BeatMetrics = emptyBeat();
  private modulators: Modulator[] = [];

  // Variabilità respiratoria.
  private respBeats: { t: number; pp: number; sv: number }[] = [];

  constructor(params: Params = defaultParams(), seed = 12345) {
    this.params = cloneParams(params);
    this.effParams = cloneParams(params);
    this.y = initialState(this.effParams);
    this.aux = new Float64Array(AUX_SIZE);
    this.vent = newVentilationState();
    this.scheduler = new RhythmScheduler(this.effParams.rhythm, seed);
    this.ctx = newEvalContext(this.vent);
    this.analyzer.reset(0);
  }

  addModulator(m: Modulator): void {
    this.modulators.push(m);
  }

  /**
   * Imposta i parametri base. `effParams` viene risincronizzato su base; i modulatori
   * (se presenti) riapplicano i moltiplicatori a ogni passo in `onStep`.
   */
  setParams(p: Params): void {
    this.params = cloneParams(p);
    this.effParams = cloneParams(p);
    this.scheduler.setParams(this.effParams.rhythm);
  }

  /** Imposta i parametri effettivi senza transizione (usato dai modulatori e dai test). */
  setEffective(p: Params): void {
    this.effParams = cloneParams(p);
    this.scheduler.setParams(this.effParams.rhythm);
  }

  get currentBeat(): BeatMetrics {
    return this.beat;
  }

  get context(): EvalContext {
    return this.ctx;
  }

  private infusionRate(): number {
    const p = this.effParams;
    let total = 0;
    for (let i = 0; i < 8; i++) total += this.y[i]!;
    const deficit = p.bloodVolume - total;
    const r = deficit; // guadagno 1/s: entro 1 mL di deficit → 1 mL/s
    return r > p.infusionRate ? p.infusionRate : r < -p.infusionRate ? -p.infusionRate : r;
  }

  /** Un passo di integrazione RK4 di durata DT. */
  step(): void {
    const p = this.effParams;
    const t0 = this.t;
    const tm = t0 + DT / 2;
    const te = t0 + DT;

    for (const m of this.modulators) m.onStep?.(this, DT);

    // Attivazioni: avanza lo scheduler fino a fine passo (rileva il QRS), poi campiona ai sub-tempi.
    const evEnd = this.scheduler.advance(te);
    const a0 = this.scheduler.activationAt(t0);
    const am = this.scheduler.activationAt(tm);
    const ae = this.scheduler.activationAt(te);

    this.ctx.infusion = this.infusionRate();

    // k1
    computeVentilation(t0, p.ventilation, this.vent);
    this.ctx.eV = a0.eV;
    this.ctx.eA = a0.eA;
    evaluate(p, this.y, this.ctx, this.dy1, this.aux);
    // Accumula il campione (stato a inizio passo).
    this.analyzer.sample(DT, this.aux, this.y[S.V_LV]!, this.y[S.V_RV]!, this.ctx.districtFlow);

    // k2
    computeVentilation(tm, p.ventilation, this.vent);
    this.ctx.eV = am.eV;
    this.ctx.eA = am.eA;
    for (let i = 0; i < STATE_SIZE; i++) this.ytmp[i] = this.y[i]! + (DT / 2) * this.dy1[i]!;
    evaluate(p, this.ytmp, this.ctx, this.dy2, this.auxTmp);

    // k3
    for (let i = 0; i < STATE_SIZE; i++) this.ytmp[i] = this.y[i]! + (DT / 2) * this.dy2[i]!;
    evaluate(p, this.ytmp, this.ctx, this.dy3, this.auxTmp);

    // k4
    computeVentilation(te, p.ventilation, this.vent);
    this.ctx.eV = ae.eV;
    this.ctx.eA = ae.eA;
    for (let i = 0; i < STATE_SIZE; i++) this.ytmp[i] = this.y[i]! + DT * this.dy3[i]!;
    evaluate(p, this.ytmp, this.ctx, this.dy4, this.auxTmp);

    for (let i = 0; i < STATE_SIZE; i++) {
      this.y[i] = this.y[i]! + (DT / 6) * (this.dy1[i]! + 2 * this.dy2[i]! + 2 * this.dy3[i]! + this.dy4[i]!);
    }
    clampValves(p, this.y);
    this.t = te;

    if (evEnd.qrs) this.finalizeBeat();
  }

  private finalizeBeat(): void {
    const p = this.effParams;
    this.analyzer.finalize(p, this.scheduler.rr, this.beat, this.t);
    BeatAnalyzer.fillFilling(p, this.y[S.V_SA]!, this.y[S.V_SV]!, this.beat);

    // Variabilità respiratoria su un ciclo respiratorio.
    const pp = this.beat.pas - this.beat.pad;
    this.respBeats.push({ t: this.t, pp, sv: this.beat.sv });
    const period = 60 / Math.max(p.ventilation.rr, 1);
    const cutoff = this.t - period;
    while (this.respBeats.length > 0 && this.respBeats[0]!.t < cutoff) this.respBeats.shift();
    if (this.respBeats.length >= 2) {
      let ppMax = -1e9,
        ppMin = 1e9,
        svMax = -1e9,
        svMin = 1e9;
      for (const b of this.respBeats) {
        if (b.pp > ppMax) ppMax = b.pp;
        if (b.pp < ppMin) ppMin = b.pp;
        if (b.sv > svMax) svMax = b.sv;
        if (b.sv < svMin) svMin = b.sv;
      }
      const ppMean = (ppMax + ppMin) / 2;
      const svMean = (svMax + svMin) / 2;
      this.beat.ppv = ppMean > 1e-6 ? (100 * (ppMax - ppMin)) / ppMean : 0;
      this.beat.svv = svMean > 1e-6 ? (100 * (svMax - svMin)) / svMean : 0;
    }

    for (const m of this.modulators) m.onBeat?.(this, this.beat);
    this.analyzer.reset(this.t);
  }

  /** Avanza di `seconds` secondi di tempo simulato. */
  run(seconds: number): void {
    const n = Math.round(seconds / DT);
    for (let i = 0; i < n; i++) this.step();
  }

  /** Volume ematico totale corrente (somma dei compartimenti). */
  totalVolume(): number {
    let total = 0;
    for (let i = 0; i < 8; i++) total += this.y[i]!;
    return total;
  }

  /** Snapshot leggibile dei flussi di distretto correnti (L/min). */
  districtFlows(): number[] {
    const out = new Array<number>(DISTRICT_COUNT);
    for (let i = 0; i < DISTRICT_COUNT; i++) out[i] = this.ctx.districtFlow[i]! * (60 / 1000);
    return out;
  }
}
