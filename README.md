# CardioSim 3D

Simulatore emodinamico 3D del cuore, pensato per iPhone (Safari, WebGL2) e per la formazione in
Anestesia e Rianimazione.

**Demo:** https://nerv15822.github.io/claude/

## Sviluppo

```bash
npm ci
npm run dev        # sviluppo
npm test           # test del modello fisiologico
npm run build      # build di produzione (dist/)
```

Il deploy su GitHub Pages è automatico a ogni push su `main`
(Settings → Pages → Source: **GitHub Actions**).

## Stato

- [x] Fase 1 — scaffold + deploy Pages
- [x] Fase 2 — motore fisiologico + validazione
- [x] Fase 3 — tracciati, Wiggers, loop PV
- [x] Fase 4 — cuore 3D procedurale
- [ ] Fase 5 — valvole, particelle, sezioni
- [ ] Fase 6 — patologie, interventi, schede didattiche
- [ ] Fase 7 — rifinitura grafica, performance, PWA

## Motore fisiologico (`src/physiology`)

Modello a parametri concentrati, circolazione chiusa, 15 variabili di stato, integrazione RK4 a passo fisso
(dt = 0.5 ms) eseguita in un Web Worker (~120× tempo reale su desktop).

| Componente               | Modello                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------ |
| Camere (VS, VD, AS, AD)  | Elastanza tempo-variante: `P = e(t)·Ees·(V−Vd) + (1−e(t))·P0·(e^{λ(V−V0)}−1)`              |
| Attivazione ventricolare | Doppia Hill (Stergiopulos 1996), durata ∝ √RR                                              |
| Attivazione atriale      | Coseno rialzato che inizia con la P; QRS dopo l'intervallo PR                              |
| Setto                    | Parete libera + setto (Smith 2004), risolto con Newton a ogni valutazione                  |
| Pericardio               | `Ppc = P0·(e^{(Vcuore+versamento−V0)/Vk}−1)`, agisce su tutte e quattro le camere          |
| Valvole                  | `L·dQ/dt = ΔP − R·Q − B·Q·abs(Q)`, `B = ρ/2A²` (Bernoulli), `L = ρl/A`; area / EROA        |
| Circoli                  | Windkessel a 3 elementi (Zc, R, C) + compartimento venoso capacitivo (stressed/unstressed) |
| Torace                   | Pressione pleurica variabile: apnea, respiro spontaneo, VPP a volume controllato con PEEP  |
| Shunt                    | DIA, DIV, dotto arterioso: orifizi di Bernoulli con inertanza, bidirezionali               |
| Ritmo                    | Sinusale, FA (RR irregolare, nessuna sistole atriale), BAV III (dissociazione AV)          |
| SvO₂                     | Fick semplificato: `SvO₂ = SaO₂ − VO₂/(GC·1.34·Hb·10)`                                     |

### Validazione (caso normale, FC 70, respiro spontaneo)

| Grandezza     | Target                    | Modello          |
| ------------- | ------------------------- | ---------------- |
| Aorta         | 120/80 ± 10               | 122/74 (99)      |
| VS            | 120 / 4–10                | 127/7            |
| AS / AD       | 6–12 / 2–6                | 6.7 / 3.3        |
| VD            | 25 / 2–6                  | 26/3.5           |
| AP            | 25/10 (12–18)             | 22/9 (15.5)      |
| GC · FE · VTD | 4.5–6 · 55–65 % · 120–140 | 5.5 · 61 % · 128 |

Test di direzione (`tests/physiology/directions.test.ts`): Frank-Starling, postcarico, contrattilità,
stenosi aortica (AVA 0.7 cm² → gradiente medio ≈ 50 mmHg), insufficienza mitralica e aortica, ↑PVR,
tamponamento (equalizzazione delle pressioni, polso paradosso > 10 mmHg), PPV > 13 % in ipovolemia ventilata,
PEEP, tachicardia, FA, BAV III, DIV (Qp/Qs > 1.5).

`npm run calibrate -- '{"aortic":{"area":0.7}}'` stampa i valori a regime per qualsiasi patch di parametri.

## Cuore 3D (`src/scene`)

- **Anatomia procedurale** (`scene/heart/anatomy.ts`), descritta come campo di distanza (SDF) in cm:
  - VS e VD con asse lungo orientato in avanti, in basso e a sinistra, infundibolo del VD, AS e AD con le
    auricole;
  - aorta con radice, arco e tronchi sovraortici, tronco polmonare con biforcazione, cave, quattro vene
    polmonari; i vasi sono sezionati con estremità piatte;
  - la mesh è estratta con _surface nets_ a banda stretta in un Web Worker (≈ 0.5–1 s);
  - coronarie (IVA, IVP, coronaria destra, circonflessa) tracciate automaticamente nei solchi;
  - grasso epicardico colorato lungo solco AV, solchi interventricolari e radice dei vasi.
- **Battito guidato dal motore**, nel vertex shader. Ogni vertice ha pesi di regione (VS, VD, AS, AD,
  aorta, AP, vene). Il fattore di scala epicardico è `S = (V + Vparete)/(Vrif + Vparete)`, perché il
  miocardio è incomprimibile.
  - Ventricoli: accorciamento assiale ancorato all'apice (quindi discesa dell'anello AV) e radiale, più la
    torsione del VS proporzionale all'attivazione.
  - Atri: scala isotropa.
  - Aorta e AP: distensione radiale proporzionale alla pressione.
- **Materiale:** `MeshPhysicalMaterial` con clearcoat (superficie umida), sheen (diffusione superficiale),
  colori per vertice. Illuminazione da studio/sala operatoria con lightformer procedurali (nessun HDRI
  da scaricare), tone mapping ACES, DPR adattivo (`PerformanceMonitor`).
- **Interfaccia:** cuore a pieno schermo, viste predefinite (anteriore, laterale sinistra, posteriore,
  dall'apice, dalla base), OrbitControls touch. Il bottom sheet trascinabile ha tre livelli e diventa
  un pannello laterale in orizzontale.

### Usare un modello anatomico GLB

Se esiste `public/models/heart.glb`, viene caricato al posto del cuore procedurale e normalizzato a circa
22 cm di altezza. Le mesh riconosciute per nome vengono scalate con i volumi del motore:

| Struttura                    | Nomi accettati (maiuscole indifferenti)                                 |
| ---------------------------- | ----------------------------------------------------------------------- |
| Ventricolo sinistro / destro | `LV`, `left_ventricle`, `ventricolo_sinistro` / `RV`, `right_ventricle` |
| Atrio sinistro / destro      | `LA`, `left_atrium` / `RA`, `right_atrium`                              |
| Aorta                        | qualsiasi nome contenente `aort`                                        |
| Arteria polmonare            | `pulmonary_artery`, `pulmonary_trunk`, `PA`                             |
| Altro (non deformato)        | `coronary_*`, `valve_*`, `svc`, `ivc`, `pulmonary_veins`, …             |

Fonti di modelli con licenza compatibile:

- **BodyParts3D** (DBCLS, CC BY-SA 2.1 JP): mesh separate per camere e vasi, da convertire in GLB con Blender.
- **Z-Anatomy** (CC BY-SA 4.0), basato su BodyParts3D: file Blender già organizzati per struttura.
- **Sketchfab**: filtrare per licenza CC BY e citare l'autore. Verificare che camere e vasi siano mesh separate.

Consiglio: in Blender separare le mesh per struttura, rinominarle come sopra, applicare le trasformazioni
ed esportare in glTF binario con compressione Draco disattivata (il loader non include il decoder).

## Approssimazioni del modello

Da leggere prima di usare il simulatore per la didattica.

- **Parametri concentrati:** nessuna propagazione né riflessione d'onda (salvo l'effetto di Zc), nessun
  gradiente centro-periferia; la "PA" è la pressione aortica prossimale.
- **Nessun controllo riflesso (baroriflesso, venocostrizione, RAAS):** FC, resistenze e volume stressed
  cambiano solo se li modifica l'utente o un preset. In ipovolemia e nel tamponamento mancano quindi la
  tachicardia e la venocostrizione compensatorie. Per esempio, nel tamponamento le pressioni si equalizzano
  a ~8–10 mmHg invece dei 15–20 osservati in clinica, dove la venocostrizione alza la pressione media di
  riempimento. I preset della Fase 6 introdurranno la compensazione in modo esplicito.
- **EDPVR esponenziale:** nella fase diastolica si usa una relazione esponenziale al posto dell'Emin lineare
  del modello di Suga-Sagawa "puro", per rappresentare correttamente dilatazione, rigidità e tamponamento.
- **Setto a relazione passiva simmetrica (sinh):** a differenza di Smith 2004 permette gradienti transsettali
  negativi (sovraccarico del VD).
- **Valvole:** le aree efficaci sono parametri, non c'è una dinamica dei lembi nel motore (Mynard): apertura e
  chiusura sono istantanee all'inversione del flusso. Il rigurgito di chiusura fisiologico non è modellato.
  L'inertanza del getto usa l'area dell'orifizio.
- **Interazione cuore-polmone:** camere, pericardio e circolo polmonare subiscono la pressione pleurica. Le
  arterie sistemiche e il compartimento venoso sistemico sono trattati come extratoracici (aorta toracica
  inclusa). La pressione alveolare aumenta la PVR in modo lineare (nessuna zona di West esplicita). In VPP
  la pressione pleurica è una frazione fissa (default 0.5) della pressione alveolare.
- **Pressione pleurica di fine espirazione:** −3 mmHg; tutte le pressioni riportate sono assolute (riferite
  all'atmosfera), come in un trasduttore azzerato.
- **Ossigenazione:** VO₂ costante, SaO₂ fissa (98 %), O₂ disciolto trascurato, nessun effetto dello shunt
  sulla SaO₂.
- **Ritmo:** la durata dell'attivazione ventricolare scala con √RR; in FA l'RR è estratto da una
  gaussiana troncata (CV 20 %) con PRNG deterministico.
- **Coronarie, autoregolazione e ischemia:** non modellate nel motore.
- **ECG:** sintetico (somma di gaussiane agganciate agli eventi del motore), non elettrofisiologico.
- **Fonocardiogramma:** schematico. S1 ed S2 compaiono alla chiusura valvolare e la loro ampiezza è
  proporzionale a dP/dt e alla pressione a valle. S3 e S4 usano soglie euristiche sulla pressione atriale
  sinistra e sulla PTD del VS (> 14 mmHg). I soffi sono rumore proporzionale alla velocità del getto oltre 2 m/s.
- **Pletismografia:** pressione arteriosa filtrata passa-basso (τ 120 ms), normalizzata: non modella
  vasomotilità periferica né perfusione.
- **Curva di Frank-Starling:** calcolata in apnea variando istantaneamente la volemia (8 s di transitorio
  per punto). Il punto di lavoro è misurato con la ventilazione corrente, quindi può discostarsi di poco.
- **Onde della CVP:** l'escursione a-v del modello (~8 mmHg) è maggiore di quella clinica (3–5 mmHg).
- **Anatomia 3D:** le proporzioni sono plausibili ma schematiche. La superficie è solo epicardica: cavità
  endocardiche, setto interno e valvole arrivano nella Fase 5.
- **Deformazione 3D:** è cinematica, non meccanica, e non viene da un modello a elementi finiti. Le frazioni
  assiale e radiale dell'accorciamento (esponenti 0.3/0.35), la torsione massima (≈ 11°) e la distensibilità
  visiva dei vasi sono scelte per plausibilità. I volumi delle camere sono invece quelli del motore. Con un
  modello GLB esterno la deformazione è per mesh (scala attorno al baricentro), quindi più grossolana.
