/**
 * Stampa i valori a regime del caso normale (o con patch JSON passata come argomento).
 * Uso: npm run calibrate -- '{"lv":{"ees":2.8}}'
 */
import { CardioEngine, averageBeats } from '../src/physiology/engine';
import type { ParamsPatch } from '../src/physiology/params';

const patch = (process.argv[2] ? JSON.parse(process.argv[2]) : {}) as ParamsPatch;
const e = new CardioEngine();
e.setParams(patch);
const t0 = performance.now();
e.advance(40);
const b = averageBeats(e, 10);
const ms = performance.now() - t0;
const r = e.lastResp;
const f = (x: number, d = 1) => x.toFixed(d);
console.log(`Simulati 50 s in ${f(ms, 0)} ms (${f((50 / ms) * 1000, 0)}× tempo reale)`);
console.log(`Ao      ${f(b.aoSys)}/${f(b.aoDia)} (${f(b.aoMean)})`);
console.log(
  `VS      ${f(b.lvSys)}/${f(b.lvEdp)}   VTD ${f(b.lvEdv)}  VTS ${f(b.lvEsv)}  FE ${f(b.ef * 100)}%`,
);
console.log(
  `VD      ${f(b.rvSys)}/${f(b.rvEdp)}   VTD ${f(b.rvEdv)}  VTS ${f(b.rvEsv)}  FE ${f(b.rvEf * 100)}%`,
);
console.log(`AP      ${f(b.paSys)}/${f(b.paDia)} (${f(b.paMean)})`);
console.log(`AS      ${f(b.laMean)} (max ${f(b.laMax)})   AD ${f(b.raMean)} (max ${f(b.raMax)})`);
console.log(`GC      ${f(b.co, 2)} L/min  VS ${f(b.forwardSv)} mL  FC ${f(b.hr)}  SvO2 ${f(b.svo2 * 100)}%`);
console.log(`SVR     ${f(b.svr, 0)}  PVR ${f(b.pvr, 0)} dyn·s·cm⁻⁵   Ppc ${f(b.periMean)}`);
console.log(`Grad    Ao ${f(b.avMeanGradient)} (picco ${f(b.avPeakGradient)})  Mi ${f(b.mvMeanGradient)}`);
console.log(`SW      ${f(b.strokeWork, 0)} mmHg·mL`);
console.log(`Resp    PPV ${f(r.ppv)}%  SVV ${f(r.svv)}%  ΔPAS ${f(r.sbpVariation)} mmHg`);
console.log(`Volume  ${f(e.totalVolume(), 3)} mL`);
