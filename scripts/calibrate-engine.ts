/**
 * Emodinamica — stampa i valori a regime del caso normale (motore puro).
 * Uso:  npx tsx scripts/calibrate-engine.ts  [secondi]
 */
import { CardioEngine, DISTRICT_KEYS, defaultParams } from '../src/engine';

const seconds = Number(process.argv[2] ?? 40);
const eng = new CardioEngine(defaultParams());
eng.run(seconds);

const b = eng.currentBeat;
const f = (x: number, d = 1) => x.toFixed(d);

console.log('— Emodinamica · caso normale a regime —');
console.log(`FC            ${f(b.hr, 0)} bpm`);
console.log(`Aorta         ${f(b.pas, 0)}/${f(b.pad, 0)}  (media ${f(b.map, 0)})`);
console.log(`VS            ${f(b.lvedv, 0)}→${f(b.lvesv, 0)} mL · FE ${f(b.lvef, 0)} %`);
console.log(`VD            FE ${f(b.rvef, 0)} %`);
console.log(`CO / SV       ${f(b.co, 2)} L/min · ${f(b.sv, 0)} mL`);
console.log(`CVP (AD)      ${f(b.cvp, 1)} mmHg`);
console.log(`PAOP (AS)     ${f(b.paop, 1)} mmHg`);
console.log(`AP            ${f(b.paps, 0)}/${f(b.papd, 0)}  (media ${f(b.papm, 0)})`);
console.log(`SVR           ${f(b.svr, 0)} dyn·s·cm⁻⁵`);
console.log(`PVR           ${f(b.pvr, 0)} dyn·s·cm⁻⁵  (${f(b.pvrWood, 2)} WU)`);
console.log(`MSFP          ${f(b.msfp, 1)} mmHg`);
console.log(`Vol. stressato ${f(b.stressedVolume, 0)} mL`);
console.log(`Ea/Ees        ${f(b.ea, 2)}/${f(b.ees, 2)} = ${f(b.eaOverEes, 2)}`);
console.log(`CPP           ${f(b.cpp, 0)} mmHg`);
console.log(`Lavoro est.   ${f(b.externalWork, 3)} J/battito`);
console.log(`PPV / SVV     ${f(b.ppv, 1)} % / ${f(b.svv, 1)} %`);
console.log(`Volume totale ${f(eng.totalVolume(), 0)} mL`);
console.log('Flussi di distretto (L/min · frazione):');
for (let i = 0; i < DISTRICT_KEYS.length; i++) {
  console.log(
    `  ${DISTRICT_KEYS[i]!.padEnd(11)} ${f(b.districtFlow[i]!, 2)}  ${f(b.districtFraction[i]! * 100, 0)}%`,
  );
}
