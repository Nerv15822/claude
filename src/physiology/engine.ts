/**
 * Motore emodinamico: integrazione RK4 a passo fisso (dt = 0.5 ms), disaccoppiata dal frame rate.
 */
import { AUX_SIZE, A, S, STATE_SIZE, clampValves, evaluate, type EvalContext } from './model';
import { BeatAnalyzer, RespAnalyzer, type BeatMetrics, type RespMetrics } from './metrics';
import { DRUG_KEYS, DrugState, neutralModifiers, type Modifiers } from './drugs';
import { applyPatch, cloneParams, defaultParams, type Params, type ParamsPatch } from './params';
import { ecgValue } from './ecg';
import { RhythmScheduler } from './rhythm';
import { PhonoGenerator, jetVelocity, murmurFromVelocity } from './sounds';
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
  'ecg',
  'phono',
  'pleth',
  'qVR',
  'qPVin',
  'qSYS',
  'qPULM',
  'balloon',
] as const;
export type SampleField = (typeof SAMPLE_FIELDS)[number];
export const SAMPLE_SIZE = SAMPLE_FIELDS.length;
export const F = Object.fromEntries(SAMPLE_FIELDS.map((k, i) => [k, i])) as Record<SampleField, number>;

export interface EngineOptions {
  dt?: number;
  seed?: number;
  params?: Params;
}

/** Foglie numeriche dei parametri: [gruppo | null, chiave] (costruite una volta sola). */
type Leaf = [string | null, string, number];
function buildLeaves(p: Params): Leaf[] {
  const out: Leaf[] = [];
  for (const [g, v] of Object.entries(p)) {
    if (typeof v === 'number') out.push([null, g, tauFor(g, '')]);
    else if (typeof v === 'object' && v !== null)
      for (const [k, x] of Object.entries(v as Record<string, unknown>))
        if (typeof x === 'number') out.push([g, k, tauFor(g, k)]);
  }
  return out;
}
/**
 * Costante di tempo (s) con cui i parametri effettivi inseguono il valore impostato: le modifiche
 * (preset di patologia, slider) sono graduali. 0 = immediato (volemia e farmaci hanno la loro cinetica).
 */
function tauFor(group: string, key: string): number {
  if (group === 'bloodVolume' || group === 'drugs' || group === 'infusionRate') return 0;
  if (group === 'pericardium' && key === 'effusion') return 12;
  if (group === 'rhythm' && key === 'pr') return 0;
  return 1.5;
}

export interface ReflexState {
  /** Moltiplicatori attuali degli effettori (1 = nessun intervento riflesso) */
  hr: number;
  resistance: number;
  venous: number;
  contractility: number;
  /** PAM filtrata percepita dai barocettori */
  map: number;
}

/** Intervallo di aggiornamento di parametri effettivi, farmaci e riflessi (s). */
const MODULATION_DT = 0.01;

export class CardioEngine {
  /** Parametri effettivi usati dal modello (base + farmaci + riflessi) */
  readonly params: Params;
  /** Parametri impostati dall'utente/preset (obiettivo) */
  readonly target: Params;
  /** Parametri di base: inseguono il target con transizione graduale */
  readonly base: Params;
  readonly drugs = new DrugState();
  readonly mods: Modifiers = neutralModifiers({} as Modifiers);
  readonly reflex: ReflexState = { hr: 1, resistance: 1, venous: 1, contractility: 1, map: 99.5 };
  private readonly leaves: Leaf[];
  private reflexX = { hr: 0, r: 0, v: 0, e: 0 };
  private modAccum = 0;
  private balloon = 0;
  private balloonInflate = false;
  private bolusRate = 0;
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
  readonly phono = new PhonoGenerator();
  /** Pressione arteriosa filtrata (passa-basso) come surrogato della pletismografia */
  private pleth = 90;
  private prevQmv = 0;
  private prevQav = 0;
  private prevQtv = 0;
  private prevQpv = 0;
  private prevPlv = 0;
  private prevPrv = 0;
  private prevEA = 0;
  private prevDQmv = 0;

  constructor(opts: EngineOptions = {}) {
    const p0 = opts.params ?? defaultParams();
    this.params = p0;
    this.target = cloneParams(p0);
    this.base = cloneParams(p0);
    this.leaves = buildLeaves(p0);
    this.reflex.map = p0.reflex.setpoint;
    this.dt = opts.dt ?? DEFAULT_DT;
    this.rhythm = new RhythmScheduler(opts.seed ?? 1);
    this.ctx = { eV: 0, eA: 0, vent: this.vent, infusion: 0, septumGuess: 3, balloon: 0 };
    // Infusioni già in corso all'avvio: concentrazioni all'effettore a regime
    for (const k of DRUG_KEYS) this.drugs.ce[k] = p0.drugs[k];
    this.initState();
    this.modulate(0);
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

  /**
   * Imposta i parametri obiettivo. I valori numerici vengono raggiunti gradualmente (tauFor), quelli
   * discreti (ritmo, modalità ventilatoria, flag) immediatamente.
   */
  setParams(patch: ParamsPatch): void {
    applyPatch(this.target, patch);
    for (const g of Object.keys(patch) as (keyof Params)[]) {
      const v = patch[g];
      if (typeof v === 'object' && v !== null) {
        for (const [k, x] of Object.entries(v)) {
          if (typeof x !== 'number') {
            (this.base[g] as unknown as Record<string, unknown>)[k] = x;
            (this.params[g] as unknown as Record<string, unknown>)[k] = x;
          }
        }
      }
    }
  }

  /** Applica subito i parametri obiettivo, senza transizione (test, analisi offline, reset). */
  settleParams(): void {
    for (const [g, k] of this.leaves) {
      if (g === null)
        (this.base as unknown as Record<string, number>)[k] = (
          this.target as unknown as Record<string, number>
        )[k]!;
      else
        (this.base as unknown as Record<string, Record<string, number>>)[g]![k] = (
          this.target as unknown as Record<string, Record<string, number>>
        )[g]![k]!;
    }
    this.modulate(0);
  }

  /** Bolo di liquidi: `volume` mL in `seconds` s. */
  fluidBolus(volume: number, seconds: number): void {
    this.target.bloodVolume += volume;
    this.base.bloodVolume = this.target.bloodVolume;
    this.params.bloodVolume = this.target.bloodVolume;
    this.bolusRate = Math.abs(volume) / Math.max(seconds, 1);
  }

  /** Bolo di propofol (mg/kg). */
  bolusPropofol(mgPerKg: number): void {
    this.drugs.bolusPropofol(mgPerKg);
  }

  /**
   * Aggiorna base (transizione verso il target), farmacologia e baroriflesso, e calcola i parametri
   * effettivi: effettivo = base × farmaci × riflesso sui determinanti (FC, Ees, λ, RVS, RVP, volume
   * unstressed venoso). Senza allocazioni.
   */
  private modulate(dt: number): void {
    const B = this.base as unknown as Record<string, Record<string, number> | number>;
    const T = this.target as unknown as Record<string, Record<string, number> | number>;
    const P = this.params as unknown as Record<string, Record<string, number> | number>;
    for (const [g, k, tau] of this.leaves) {
      const tgt = g === null ? (T[k] as number) : (T[g] as Record<string, number>)[k]!;
      let b = g === null ? (B[k] as number) : (B[g] as Record<string, number>)[k]!;
      b = tau <= 0 || dt <= 0 ? tgt : b + (tgt - b) * (1 - Math.exp(-dt / tau));
      if (Math.abs(tgt - b) < 1e-9 * (Math.abs(tgt) + 1e-9)) b = tgt;
      if (g === null) {
        B[k] = b;
        P[k] = b;
      } else {
        (B[g] as Record<string, number>)[k] = b;
        (P[g] as Record<string, number>)[k] = b;
      }
    }
    const base = this.base;
    const p = this.params;
    this.drugs.update(dt, base.drugs);
    const m = this.drugs.modifiers(this.mods);

    // Baroriflesso: PAM filtrata (τ 2 s), errore frazionale, effettori con costanti di tempo diverse
    const rf = this.reflex;
    const x = this.reflexX;
    if (dt > 0) rf.map += ((this.aux[A.P_AO]! - rf.map) * dt) / 2;
    const on = base.reflex.enabled ? 1 : 0;
    const err = Math.max(-0.5, Math.min(0.6, (base.reflex.setpoint - rf.map) / base.reflex.setpoint)) * on;
    const g = m.reflexGain;
    if (dt > 0) {
      x.hr += ((base.reflex.gainHR * g * m.reflexHR * err - x.hr) * dt) / 3;
      x.r += ((base.reflex.gainR * g * err - x.r) * dt) / 8;
      x.v += ((-base.reflex.gainVenous * g * err - x.v) * dt) / 20;
      x.e += ((base.reflex.gainContractility * g * m.reflexHR * err - x.e) * dt) / 10;
    }
    rf.hr = Math.min(Math.max(1 + x.hr, 0.6), 2.0);
    rf.resistance = Math.min(Math.max(1 + x.r, 0.6), 1.8);
    rf.venous = Math.min(Math.max(1 + x.v, 0.88), 1.08);
    rf.contractility = Math.min(Math.max(1 + x.e, 0.8), 1.35);

    p.rhythm.hr = base.rhythm.hr * m.hr * rf.hr;
    p.lv.ees = base.lv.ees * m.lvEes * rf.contractility;
    p.rv.ees = base.rv.ees * m.rvEes * rf.contractility;
    p.lv.lambda = base.lv.lambda * m.lambda;
    p.rv.lambda = base.rv.lambda * m.lambda;
    p.systemic.r = base.systemic.r * m.svr * rf.resistance;
    p.pulmonary.r = base.pulmonary.r * m.pvr;
    p.systemic.vv0 = base.systemic.vv0 * m.venous * rf.venous;
  }

  /**
   * Imposta istantaneamente la volemia (aggiungendo/togliendo volume nel compartimento venoso
   * sistemico). Usato dalle analisi offline (curva di Frank-Starling), non dalla simulazione in tempo reale.
   */
  setBloodVolumeImmediate(volume: number): void {
    this.y[S.V_SV] = this.y[S.V_SV]! + volume - this.totalVolume();
    this.params.bloodVolume = volume;
    this.base.bloodVolume = volume;
    this.target.bloodVolume = volume;
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

    this.modAccum += dt;
    if (this.modAccum >= MODULATION_DT) {
      this.modulate(this.modAccum);
      this.modAccum = 0;
    }
    this.rhythm.update(t0, p.rhythm);

    // Variazione graduale della volemia verso il target (boli a velocità definita)
    const dv = p.bloodVolume - this.totalVolume();
    const maxRate = Math.min(MAX_INFUSION_RATE, this.bolusRate > 0 ? this.bolusRate : p.infusionRate);
    if (Math.abs(dv) < 0.5) this.bolusRate = 0;
    this.infusion = Math.abs(dv) < 1e-3 ? 0 : Math.max(-maxRate, Math.min(maxRate, dv / 2));
    this.ctx.infusion = this.infusion;

    // Contropulsatore: gonfiaggio alla chiusura aortica (diastole), sgonfiaggio al QRS successivo
    if (p.iabp.enabled) {
      const target = this.balloonInflate ? p.iabp.volume : 0;
      this.balloon += ((target - this.balloon) * dt) / 0.035;
    } else this.balloon = 0;
    this.ctx.balloon = this.balloon;

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

    this.detectSounds(dt);
    this.pleth += (dt / 0.12) * (this.aux[A.P_AO]! - this.pleth);

    this.beat.accumulate(dt, y, this.aux);
    if (this.rhythm.qrsFired) this.balloonInflate = false;
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

  /** Eventi acustici (toni e soffi) dal passo appena integrato. */
  private detectSounds(dt: number): void {
    const p = this.params;
    const y = this.y;
    const a = this.aux;
    const t = this.t;
    const ph = this.phono;
    const qmv = y[S.Q_MV]!;
    const qav = y[S.Q_AV]!;
    const qtv = y[S.Q_TV]!;
    const qpv = y[S.Q_PV]!;
    const plv = a[A.P_LV]!;
    const dpdt = (plv - this.prevPlv) / dt;

    // S1: chiusura delle valvole atrioventricolari
    // (ampiezza ∝ dP/dt: una chiusura in diastasi, a dP/dt ~0, è silente)
    const prv = a[A.P_RV]!;
    const dpdtRv = (prv - this.prevPrv) / dt;
    if (this.prevQmv > 0 && qmv <= 0) ph.burst(t, Math.min(Math.max(dpdt / 1500, 0), 1.6), 45, 0.018);
    if (this.prevQtv > 0 && qtv <= 0)
      ph.burst(t + 0.015, Math.min(Math.max(dpdtRv / 600, 0), 0.6), 40, 0.016);
    // S2: chiusura delle semilunari
    if (this.prevQav > 0 && qav <= 0) {
      ph.burst(t, Math.min(a[A.P_AO]! / 110, 1.6), 60, 0.014);
      this.balloonInflate = true;
    }
    if (this.prevQpv > 0 && qpv <= 0) ph.burst(t, Math.min((0.45 * a[A.P_PA_PROX]!) / 20, 1.4), 55, 0.012);
    // S3: fine del riempimento rapido (picco dell'onda E) con pressione atriale elevata
    const dq = qmv - this.prevQmv;
    if (this.prevDQmv > 0 && dq <= 0 && qmv > 80 && a[A.E_A]! < 0.05) {
      const amp = Math.min(Math.max((a[A.P_LA]! - 14) / 10, 0), 1) * 0.8;
      ph.burst(t + 0.03, amp, 25, 0.03);
    }
    this.prevDQmv = dq;
    // S4: contrazione atriale contro un ventricolo rigido (valvola mitrale aperta)
    const eA = a[A.E_A]!;
    if (this.prevEA < 0.9 && eA >= 0.9 && qmv > 0) {
      const amp = Math.min(Math.max((plv - 14) / 10, 0), 1) * 0.7;
      ph.burst(t, amp, 25, 0.025);
    }
    this.prevEA = eA;

    // Soffi: velocità dei getti transvalvolari e di shunt
    const vm = jetVelocity(qmv, qmv >= 0 ? p.mitral.area : p.mitral.regurgitantArea);
    const va = jetVelocity(qav, qav >= 0 ? p.aortic.area : p.aortic.regurgitantArea);
    const vt = jetVelocity(qtv, qtv >= 0 ? p.tricuspid.area : p.tricuspid.regurgitantArea);
    const vp = jetVelocity(qpv, qpv >= 0 ? p.pulmonic.area : p.pulmonic.regurgitantArea);
    const vsd = jetVelocity(y[S.Q_VSD]!, p.vsd.area);
    const pda = jetVelocity(y[S.Q_PDA]!, p.pda.area);
    const asd = jetVelocity(y[S.Q_ASD]!, p.asd.area);
    const m = murmurFromVelocity(Math.max(vm, va, vt, vp, vsd, pda, asd));
    ph.murmur = 0.35 * m;

    this.prevQmv = qmv;
    this.prevQav = qav;
    this.prevQtv = qtv;
    this.prevQpv = qpv;
    this.prevPlv = plv;
    this.prevPrv = prv;
  }

  /** RR ventricolare corrente (s). */
  get currentRR(): number {
    return this.rhythm.currentRR;
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
    out[offset + F.ecg] = ecgValue({
      t: this.t,
      tP: out[offset + F.tP]!,
      tQRS: out[offset + F.tQRS]!,
      rr: this.rhythm.currentRR,
      rhythm: this.params.rhythm.rhythm,
    });
    out[offset + F.phono] = this.phono.value(this.t);
    out[offset + F.pleth] = this.pleth;
    out[offset + F.qVR] = a[A.Q_VR]!;
    out[offset + F.qPVin] = a[A.Q_PVN]!;
    out[offset + F.qSYS] = a[A.Q_SYS]!;
    out[offset + F.qPULM] = a[A.Q_PULM]!;
    out[offset + F.balloon] = this.balloon;
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
