/// <reference lib="webworker" />
/**
 * Web Worker che esegue il motore emodinamico in tempo reale, disaccoppiato dal rendering.
 * GitHub Pages non fornisce COOP/COEP → niente SharedArrayBuffer: i campioni vengono
 * inviati con postMessage in Float32Array trasferibili, riciclati dal main thread.
 */
import { CardioEngine, SAMPLE_SIZE } from '../physiology/engine';
import {
  FRAME_CAPACITY,
  FRAME_FLOATS,
  REF_OFFSET,
  SAMPLE_EVERY,
  type EngineStatus,
  type FrameMessage,
  type ToWorker,
} from './protocol';

const ctx = self as unknown as DedicatedWorkerGlobalScope;

let engine = new CardioEngine();
/** Cuore normale di riferimento (modalità confronto), avanzato in parallelo al paziente */
let ref: CardioEngine | null = null;
let lastRefBeat = 0;
let speed = 1;
let paused = false;
let lastBeat = 0;
let lastResp = 0;
let stepCounter = 0;
let accumulator = 0;
let last = performance.now();
const pool: ArrayBuffer[] = [];

function takeBuffer(): Float32Array {
  const buf = pool.pop();
  return buf ? new Float32Array(buf) : new Float32Array(FRAME_FLOATS);
}

ctx.onmessage = (ev: MessageEvent<ToWorker>) => {
  const msg = ev.data;
  switch (msg.type) {
    case 'params':
      engine.setParams(msg.patch);
      break;
    case 'reset':
      engine = new CardioEngine({ params: msg.params });
      lastBeat = lastResp = 0;
      accumulator = 0;
      break;
    case 'speed':
      speed = msg.value;
      break;
    case 'pause':
      paused = msg.value;
      break;
    case 'fluid':
      engine.fluidBolus(msg.volume, msg.seconds);
      break;
    case 'propofol':
      engine.bolusPropofol(msg.mgPerKg);
      break;
    case 'compare':
      ref = msg.value ? new CardioEngine() : null;
      lastRefBeat = 0;
      break;
    case 'recycle':
      if (msg.buffer.byteLength === FRAME_FLOATS * 4 && pool.length < 8) pool.push(msg.buffer);
      break;
  }
};

function status(): EngineStatus {
  const r = engine.reflex;
  return {
    ce: { ...engine.drugs.ce },
    propofol: engine.drugs.propofolEffect,
    reflex: { hr: r.hr, resistance: r.resistance, venous: r.venous, contractility: r.contractility },
    pendingVolume: engine.target.bloodVolume - engine.totalVolume(),
    effusion: engine.params.pericardium.effusion,
  };
}

function tick(): void {
  const now = performance.now();
  const real = Math.min((now - last) / 1000, 0.1);
  last = now;
  if (paused) return;

  accumulator += real * speed;
  const dt = engine.dt;
  const maxSteps = FRAME_CAPACITY * SAMPLE_EVERY;
  let steps = Math.min(Math.floor(accumulator / dt), maxSteps);
  accumulator -= steps * dt;
  if (accumulator > 0.2) accumulator = 0; // il dispositivo non tiene il passo: si rallenta

  const samples = takeBuffer();
  let count = 0;
  while (steps-- > 0) {
    engine.step();
    ref?.step();
    if (++stepCounter >= SAMPLE_EVERY) {
      stepCounter = 0;
      if (count < FRAME_CAPACITY) {
        ref?.writeSample(samples, REF_OFFSET + count * SAMPLE_SIZE);
        engine.writeSample(samples, count++ * SAMPLE_SIZE);
      }
    }
  }

  const msg: FrameMessage = {
    type: 'frame',
    samples,
    count,
    t: engine.t,
    beat: engine.beatCount !== lastBeat ? { ...engine.lastBeat } : null,
    resp: engine.respCount !== lastResp ? { ...engine.lastResp } : null,
    status: engine.beatCount !== lastBeat ? status() : null,
    refCount: ref ? count : 0,
    refBeat: ref && ref.beatCount !== lastRefBeat ? { ...ref.lastBeat } : null,
    realtime: real > 0 ? (count * SAMPLE_EVERY * dt) / real : 0,
  };
  lastBeat = engine.beatCount;
  if (ref) lastRefBeat = ref.beatCount;
  lastResp = engine.respCount;
  ctx.postMessage(msg, [samples.buffer]);
}

setInterval(tick, 16);
