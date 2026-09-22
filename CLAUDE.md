# CardioSim 3D — guida per lo sviluppo

Simulatore emodinamico 3D del cuore (web app mobile-first, iPhone Safari/WebGL2) per specializzandi in
Anestesia e Rianimazione. **Priorità: prima la correttezza fisiologica, poi l'effetto visivo.**

## Comandi

- `npm run dev` — server di sviluppo
- `npm run lint` · `npm run typecheck` · `npm test` · `npm run build` — tutti devono passare prima di ogni commit
- `npm run calibrate` — stampa i valori a regime del caso normale (motore fisiologico)

## Architettura (separazione netta)

| Cartella          | Contenuto                                                   | Regole                                                                                                        |
| ----------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `src/physiology`  | Motore emodinamico puro TS                                  | Nessun import da React/three/zustand/scene/ui (enforced da ESLint). Deterministico, testabile in Node.        |
| `src/workers`     | Web Worker che esegue il motore in tempo reale              | Comunica via `postMessage` con Float32Array trasferibili (Pages non ha COOP/COEP → niente SharedArrayBuffer). |
| `src/store`       | Stato Zustand (parametri, ultimi campioni, UI)              |                                                                                                               |
| `src/scene`       | Rendering 3D (Fase 4+)                                      | Legge SOLO lo stato del motore. Nessuna logica fisiologica.                                                   |
| `src/ui`          | Pannelli, tracciati, controlli                              | UI interamente in italiano.                                                                                   |
| `src/pathologies` | Preset patologie: parametri + morfologia + scheda didattica | Ogni preset ha un test di direzione in `tests/`.                                                              |

## Convenzioni

- Unità interne: **mL, mmHg, s, mL/s**. Conversioni solo ai bordi (UI: L/min, dyn·s·cm⁻⁵, cm²).
  - 1 mmHg·s/mL = 1333 dyn·s·cm⁻⁵; 1 unità Wood (mmHg·min/L) = 80 dyn·s·cm⁻⁵ = 0.06 mmHg·s/mL.
  - 1 cmH₂O = 0.7356 mmHg.
- Nessuna allocazione nel loop di integrazione né nel render loop: buffer preallocati (`Float64Array`).
- Il motore espone `step()` a passo fisso (dt = 0.5 ms, RK4); il tempo reale è gestito dal chiamante (sub-stepping).
- Ogni approssimazione fisiologica va documentata nella sezione "Approssimazioni" del README.
- Commit piccoli e descrittivi; lavorare per fasi.

## Valori di riferimento — caso normale (adulto 70 kg, FC 70, a riposo, respiro spontaneo)

| Grandezza         | Target                           |
| ----------------- | -------------------------------- |
| Pressione aortica | 120/80 ± 10 mmHg                 |
| VS                | 120 / 4–10 mmHg (telediastolica) |
| AS (≈ PCWP)       | 6–12 mmHg                        |
| AD (≈ CVP)        | 2–6 mmHg                         |
| VD                | 25 / 2–6 mmHg                    |
| Arteria polmonare | 25/10 mmHg, media 12–18          |
| Gittata cardiaca  | 4.5–6 L/min                      |
| FE VS             | 55–65 %                          |
| VTD VS            | 120–140 mL                       |

Questi range sono verificati da `tests/physiology/normal.test.ts`.

## Motore — note operative

- Stato: `S` in `model.ts` (volumi di 8 compartimenti + 7 flussi inerziali). Grandezze algebriche: `A`.
- Tutte le pressioni sono **assolute**: P = P_transmurale + P_pericardica(transmurale) + P_pleurica.
- La volemia si cambia con `params.bloodVolume`: il motore infonde/rimuove dal compartimento venoso
  sistemico a ≤ 25 mL/s, conservando esattamente la massa.
- `CardioEngine.writeSample()` produce i campi `SAMPLE_FIELDS` (250 Hz nel worker, vedi `workers/protocol.ts`).
- Metriche per battito (`BeatAnalyzer`, finalizzate al QRS successivo) e per ciclo respiratorio (`RespAnalyzer`).
- Parametri calibrati (default in `params.ts`): se si cambiano, rieseguire `npm run calibrate` e i test.
