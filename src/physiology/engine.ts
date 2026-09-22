/**
 * Motore emodinamico: integrazione RK4 a passo fisso (dt = 0.5 ms), disaccoppiata dal frame rate.
 */
import { AUX_SIZE, A, S, STATE_SIZE, clampValves, evaluate, type EvalContext } from './model';
import { BeatAnalyzer, RespAnalyzer, type BeatMetrics, type RespMetrics } from './metrics';
import { applyPatch, defaultParams, type Params, type ParamsPatch } from './params';
import { RhythmScheduler } from './rhythm';
import { computeVentilation, type VentilationState } from './ventilation';

export const DEFAULT_DT = 0.0005;
/** Velocità massima di infusione/rimozione quando cambia la volemia target (mL/s). */
const MAX_INFUSION_RATE = 25;

/** Campi di un campione (registrato ogni `sampleEvery` passi). */
export const SAMPLE_FIELDS = [
  't',
  'pLV',
  'pAo',
  'pLA',
  'pRA',
  'pRV',
  'pPA',
  'pPVn',
  'pSV',
  'vLV',
  'vRV',
  'vLA',
  'vRA',
  'qMV',
  'qAV',
  'qTV',
  'qPV',
  'qASD',
  'qVSD',
  'qPDA',
  'pPeri',
  'pTh',
  'pAw',
  'eV',
  'eA',
  'tP',
  'tQRS',
  'vSpt',
] as const;
export type SampleField = (typeof SAMPLE_FIELDS)[number];
export const SAMPLE_SIZE = SAMPLE_FIELDS.length;
export const F = Object.fromEntries(SAMPLE_FIELDS.map((k, i) => [k, i])) as Record<SampleField, number>;

export interface EngineOptions {
  dt?: number;
  seed?: number;
  params?: Params;
}

export class CardioEngine {
  readonly params: Params;
  readonly dt: number;
  t = 0;
  readonly y = new Float64Array(STATE_SIZE);
  readonly aux = new Float64Array(AUX_SIZE);
  readonly rhythm: RhythmScheduler;
  readonly beat = new BeatAnalyzer();
  readonly resp = new RespAnalyzer();
  /** Contatori incrementati a ogni nuovo battito/ciclo respiratorio completato. */
  beatCount = 0;
  respCount = 0;

  private readonly k1 = new Float64Array(STATE_SIZE);
  private readonly k2 = new Float64Array(STATE_SIZE);
  private readonly k3 = new Float64Array(STATE_SIZE);
  private readonly k4 = new Float64Array(STATE_SIZE);
  private readonly tmp = new Float64Array(STATE_SIZE);
  private readonly auxTmp = new Float64Array(AUX_SIZE);
  private readonly vent: VentilationState = { pth: 0, paw: 0, palv: 0, phase: 0, inspiration: false };
  private readonly ctx: EvalContext;
  private lastRespPhase = 0;
  private infusion = 0;

  constructor(opts: EngineOptions = {}) {
    this.params = opts.params ?? defaultParams();
    this.dt = opts.dt ?? DEFAULT_DT;
    this.rhythm = new RhythmScheduler(opts.seed ?? 1);
    this.ctx = { eV: 0, eA: 0, vent: this.vent, infusion: 0, septumGuess: 3 };
    this.initState();
  }

  /** Distribuzione iniziale plausibile della volemia; il regime si raggiunge in pochi secondi. */
  private initState(): void {
    const p = this.params;
    const y = this.y;
    y.fill(0);
    y[S.V_LA] = 55;
    y[S.V_LV] = 125;
    y[S.V_RA] = 55;
    y[S.V_RV] = 135;
    y[S.V_SA] = p.systemic.va0 + 90 * p.systemic.ca;
    y[S.V_PA] = p.pulmonary.va0 + 12 * p.pulmonary.ca;
    y[S.V_PVN] = p.pulmonary.vv0 + 10 * p.pulmonary.cv;
    let others = 0;
    for (let i = 0; i < 8; i++) if (i !== S.V_SV) others += y[i]!;
    y[S.V_SV] = p.bloodVolume - others;
    this.evaluateAux();
  }

  setParams(patch: ParamsPatch): void {
    applyPatch(this.params, patch);
  }

  /** Volume ematico totale attuale (mL). */
  totalVolume(): number {
    let v = 0;
    for (let i = 0; i < 8; i++) v += this.y[i]!;
    return v;
  }

  private prepare(t: number): void {
    const p = this.params;
    this.ctx.eV = this.rhythm.ventricular(t);
    this.ctx.eA = this.rhythm.atrial(t, p.rhythm);
    computeVentilation(t, p.ventilation, this.vent);
  }

  private evaluateAux(): void {
    this.prepare(this.t);
    this.ctx.infusion = this.infusion;
    evaluate(this.params, this.y, this.ctx, this.k1, this.aux);
  }

  /** Un passo RK4 di durata dt. */
  step(): void {
    const p = this.params;
    const dt = this.dt;
    const y = this.y;
    const tmp = this.tmp;
    const t0 = this.t;

    this.rhythm.update(t0, p.rhythm);

    // Variazione graduale della volemia verso il target
    const dv = p.bloodVolume - this.totalVolume();
    const rate = dv / 2;
    this.infusion = Math.abs(dv) < 1e-3 ? 0 : Math.max(-MAX_INFUSION_RATE, Math.min(MAX_INFUSION_RATE, rate));
    this.ctx.infusion = this.infusion;

    this.prepare(t0);
    evaluate(p, y, this.ctx, this.k1, this.auxTmp);
    for (let i = 0; i < STATE_SIZE; i++) tmp[i] = y[i]! + 0.5 * dt * this.k1[i]!;
    this.prepare(t0 + 0.5 * dt);
    evaluate(p, tmp, this.ctx, this.k2, this.auxTmp);
    for (let i = 0; i < STATE_SIZE; i++) tmp[i] = y[i]! + 0.5 * dt * this.k2[i]!;
    evaluate(p, tmp, this.ctx, this.k3, this.auxTmp);
    for (let i = 0; i < STATE_SIZE; i++) tmp[i] = y[i]! + dt * this.k3[i]!;
    this.prepare(t0 + dt);
    evaluate(p, tmp, this.ctx, this.k4, this.auxTmp);
    for (let i = 0; i < STATE_SIZE; i++) {
      y[i] = y[i]! + (dt / 6) * (this.k1[i]! + 2 * this.k2[i]! + 2 * this.k3[i]! + this.k4[i]!);
    }
    clampValves(p, y);
    this.t = t0 + dt;

    // Grandezze algebriche allo stato finale (k1 usato come buffer scratch)
    evaluate(p, y, this.ctx, this.k1, this.aux);

    this.beat.accumulate(dt, y, this.aux);
    if (this.rhythm.qrsFired && this.beat.onQrs(y, this.aux, p)) {
      this.beatCount++;
      this.resp.onBeat(this.beat.last);
    }
    const phase = this.vent.phase;
    if (phase < this.lastRespPhase && p.ventilation.mode !== 'apnea') {
      if (this.resp.onCycleEnd()) this.respCount++;
    }
    this.lastRespPhase = phase;
  }

  /** Avanza di `seconds` secondi simulati. */
  advance(seconds: number): void {
    const n = Math.round(seconds / this.dt);
    for (let i = 0; i < n; i++) this.step();
  }

  /** Scrive il campione corrente in `out` a partire da `offset`. */
  writeSample(out: Float32Array | Float64Array, offset: number): void {
    const y = this.y;
    const a = this.aux;
    out[offset + F.t] = this.t;
    out[offset + F.pLV] = a[A.P_LV]!;
    out[offset + F.pAo] = a[A.P_AO]!;
    out[offset + F.pLA] = a[A.P_LA]!;
    out[offset + F.pRA] = a[A.P_RA]!;
    out[offset + F.pRV] = a[A.P_RV]!;
    out[offset + F.pPA] = a[A.P_PA_PROX]!;
    out[offset + F.pPVn] = a[A.P_PVN]!;
    out[offset + F.pSV] = a[A.P_SV]!;
    out[offset + F.vLV] = y[S.V_LV]!;
    out[offset + F.vRV] = y[S.V_RV]!;
    out[offset + F.vLA] = y[S.V_LA]!;
    out[offset + F.vRA] = y[S.V_RA]!;
    out[offset + F.qMV] = y[S.Q_MV]!;
    out[offset + F.qAV] = y[S.Q_AV]!;
    out[offset + F.qTV] = y[S.Q_TV]!;
    out[offset + F.qPV] = y[S.Q_PV]!;
    out[offset + F.qASD] = y[S.Q_ASD]!;
    out[offset + F.qVSD] = y[S.Q_VSD]!;
    out[offset + F.qPDA] = y[S.Q_PDA]!;
    out[offset + F.pPeri] = a[A.P_PERI]!;
    out[offset + F.pTh] = a[A.P_TH]!;
    out[offset + F.pAw] = a[A.PAW]!;
    out[offset + F.eV] = a[A.E_V]!;
    out[offset + F.eA] = a[A.E_A]!;
    out[offset + F.tP] = Number.isFinite(this.rhythm.lastP) ? this.t - this.rhythm.lastP : -1;
    out[offset + F.tQRS] = Number.isFinite(this.rhythm.lastQRS) ? this.t - this.rhythm.lastQRS : -1;
    out[offset + F.vSpt] = a[A.V_SPT]!;
  }

  get lastBeat(): BeatMetrics {
    return this.beat.last;
  }

  get lastResp(): RespMetrics {
    return this.resp.last;
  }
}

/** Media delle metriche di battito su una finestra di `seconds` (utile per test e calibrazione). */
export function averageBeats(engine: CardioEngine, seconds: number): BeatMetrics {
  const acc: Record<string, number> = {};
  let n = 0;
  let lastCount = engine.beatCount;
  const steps = Math.round(seconds / engine.dt);
  for (let i = 0; i < steps; i++) {
    engine.step();
    if (engine.beatCount !== lastCount) {
      lastCount = engine.beatCount;
      n++;
      for (const [k, v] of Object.entries(engine.lastBeat)) acc[k] = (acc[k] ?? 0) + v;
    }
  }
  for (const k of Object.keys(acc)) acc[k] = acc[k]! / Math.max(n, 1);
  return acc as unknown as BeatMetrics;
}
