/**
 * Emodinamica — Web Worker del solutore: esegue il motore in tempo reale (passo fisso 1 ms,
 * sub-stepping sul tempo di parete) e invia al thread principale i tracciati (250 Hz) e,
 * a ogni battito, le metriche + trasporto di O₂ + avvisi.
 */
import { A, CardioEngine, ClinicalModulator, DRUG_IDS, DT, S, type DrugId } from '../../engine';
import { SCENARIO_BY_ID, applyScenario } from '../scenarios';
import { SAMPLE, SAMPLE_HZ, SAMPLE_STRIDE, WINDOW_SECONDS, type FromWorker, type ToWorker } from './protocol';

const engine = new CardioEngine();
const mod = new ClinicalModulator();
engine.addModulator(mod);
applyScenario(engine, mod, SCENARIO_BY_ID.normale!);
engine.run(20); // pre-stabilizzazione prima di mostrare

let speed = 1;
let paused = false;
let lastBeatT = -1;

// Ring buffer dei campioni.
const ringLen = SAMPLE_HZ * WINDOW_SECONDS;
const ring = new Float32Array(ringLen * SAMPLE_STRIDE);
let ringHead = 0;
let ringCount = 0;
let stepsSinceSample = 0;
const stepsPerSample = Math.round(1 / (DT * SAMPLE_HZ)); // 1000/250 = 4

function recordSample(): void {
  const o = ringHead * SAMPLE_STRIDE;
  ring[o + SAMPLE.t] = engine.t;
  ring[o + SAMPLE.pao] = engine.aux[A.P_AO]!;
  ring[o + SAMPLE.plv] = engine.aux[A.P_LV]!;
  ring[o + SAMPLE.pla] = engine.aux[A.P_LA]!;
  ring[o + SAMPLE.pra] = engine.aux[A.P_RA]!;
  ring[o + SAMPLE.ppa] = engine.aux[A.P_PA_PROX]!;
  ring[o + SAMPLE.prv] = engine.aux[A.P_RV]!;
  ring[o + SAMPLE.vlv] = engine.y[S.V_LV]!;
  ring[o + SAMPLE.vrv] = engine.y[S.V_RV]!;
  ringHead = (ringHead + 1) % ringLen;
  if (ringCount < ringLen) ringCount++;
}

function emitBeat(): void {
  const { oxygen, alerts } = mod.assess(engine);
  const ce: Partial<Record<DrugId, number>> = {};
  for (const id of DRUG_IDS) {
    const c = mod.pharmaco.getCe(id);
    if (c > 1e-6) ce[id] = c;
  }
  const msg: FromWorker = {
    type: 'beat',
    beat: engine.currentBeat,
    oxygen,
    alerts,
    status: {
      ce,
      responsiveness: mod.lastResponsiveness,
      nePool: mod.pharmaco.nePool,
      reflexHr: mod.reflex.hrMult,
    },
  };
  post(msg);
}

/** Invia la finestra corrente del ring in ordine cronologico (copia trasferibile). */
function emitSamples(): void {
  const out = new Float32Array(ringCount * SAMPLE_STRIDE);
  const start = (ringHead - ringCount + ringLen) % ringLen;
  for (let i = 0; i < ringCount; i++) {
    const src = ((start + i) % ringLen) * SAMPLE_STRIDE;
    out.set(ring.subarray(src, src + SAMPLE_STRIDE), i * SAMPLE_STRIDE);
  }
  (self as unknown as Worker).postMessage(
    { type: 'samples', buffer: out, count: ringCount } satisfies FromWorker,
    [out.buffer],
  );
}

function post(msg: FromWorker): void {
  (self as unknown as Worker).postMessage(msg);
}

function advance(simSeconds: number): void {
  const steps = Math.min(Math.round(simSeconds / DT), 2000); // cap anti-spirale
  for (let i = 0; i < steps; i++) {
    engine.step();
    if (++stepsSinceSample >= stepsPerSample) {
      stepsSinceSample = 0;
      recordSample();
    }
  }
}

let lastWall = performance.now();
const TICK_MS = 1000 / 60;

function tick(): void {
  const now = performance.now();
  const dtWall = Math.min((now - lastWall) / 1000, 0.1);
  lastWall = now;
  if (!paused) advance(dtWall * speed);
  emitSamples();
  const bt = engine.currentBeat.t;
  if (bt !== lastBeatT) {
    lastBeatT = bt;
    emitBeat();
  }
}

setInterval(tick, TICK_MS);

self.onmessage = (ev: MessageEvent<ToWorker>) => {
  const m = ev.data;
  switch (m.type) {
    case 'init':
    case 'scenario': {
      const sc = SCENARIO_BY_ID[m.scenarioId];
      if (sc) {
        applyScenario(engine, mod, sc);
        engine.run(10);
        ringCount = 0;
        ringHead = 0;
        lastBeatT = -1;
      }
      break;
    }
    case 'dose':
      mod.setDose(m.id, m.dose);
      break;
    case 'metabolic':
      Object.assign(mod.metabolic, m.patch);
      break;
    case 'reflex':
      mod.setReflex(m.preset, m.enabled);
      break;
    case 'bloodVolume':
      engine.params.bloodVolume = m.value;
      break;
    case 'peep':
      engine.params.ventilation.peep = m.value;
      break;
    case 'ventMode':
      engine.params.ventilation.mode = m.mode;
      break;
    case 'speed':
      speed = m.value;
      break;
    case 'paused':
      paused = m.value;
      break;
  }
};
