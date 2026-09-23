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

**Installazione su iPhone:** aprire la demo in Safari → Condividi → «Aggiungi alla schermata Home». L'app si apre
a schermo intero e, dopo la prima apertura, funziona anche offline (service worker `public/sw.js`).

## Stato

- [x] Fase 1 — scaffold + deploy Pages
- [x] Fase 2 — motore fisiologico + validazione
- [x] Fase 3 — tracciati, Wiggers, loop PV
- [x] Fase 4 — cuore 3D procedurale
- [x] Fase 5 — valvole, particelle, sezioni
- [x] Fase 6 — patologie, interventi, schede didattiche
- [x] Fase 7 — confronto con il cuore normale, performance, PWA

## Motore fisiologico (`src/physiology`)

Modello a parametri concentrati, circolazione chiusa, 15 variabili di stato, integrazione RK4 a passo fisso
(dt = 0.5 ms) eseguita in un Web Worker (~120× tempo reale su desktop).

| Componente               | Modello                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------- |
| Camere (VS, VD, AS, AD)  | Elastanza tempo-variante: `P = e(t)·Ees·(V−Vd) + (1−e(t))·P0·(e^{λ(V−V0)}−1)`               |
| Attivazione ventricolare | Doppia Hill (Stergiopulos 1996), durata ∝ √RR                                               |
| Attivazione atriale      | Coseno rialzato che inizia con la P; QRS dopo l'intervallo PR                               |
| Setto                    | Parete libera + setto (Smith 2004), risolto con Newton a ogni valutazione                   |
| Pericardio               | `Ppc = P0·(e^{(Vcuore+versamento−V0)/Vk}−1)`, agisce su tutte e quattro le camere           |
| Valvole                  | `L·dQ/dt = ΔP − R·Q − B·Q·abs(Q)`, `B = ρ/2A²` (Bernoulli), `L = ρl/A`; area / EROA         |
| Circoli                  | Windkessel a 3 elementi (Zc, R, C) + compartimento venoso capacitivo (stressed/unstressed)  |
| Torace                   | Pressione pleurica variabile: apnea, respiro spontaneo, VPP a volume controllato con PEEP   |
| Shunt                    | DIA, DIV, dotto arterioso: orifizi di Bernoulli con inertanza, bidirezionali                |
| Ritmo                    | Sinusale, FA (RR irregolare, nessuna sistole atriale), BAV III (dissociazione AV)           |
| SvO₂                     | Fick semplificato: `SvO₂ = SaO₂ − VO₂/(GC·1.34·Hb·10)`                                      |
| Baroriflesso             | PAM filtrata → FC, resistenze, capacità venosa, contrattilità (τ 3/8/20/10 s, con limiti)   |
| Farmaci                  | Concentrazione all'effettore del 1° ordine + effetti Emax come moltiplicatori (`drugs.ts`)  |
| IABP                     | Volume del pallone nel compartimento arterioso: gonfia all'incisura dicrota, sgonfia al QRS |
| CMIO                     | Area del LVOT funzione del volume del VS (ostruzione dinamica da SAM)                       |
| Bilancio O₂              | Indici di Buckberg: DPTI, SPTI, EVR = DPTI/SPTI                                             |

I parametri hanno tre livelli: **obiettivo** (utente/preset) → **base** (raggiunge l'obiettivo con una
costante di tempo, 1.5 s di default, 12 s per il versamento pericardico) → **effettivo** (base × farmaci ×
riflesso). La volemia cambia per infusione/rimozione a ≤ 25 mL/s (i boli con la loro velocità).

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

## Patologie e terapia (`src/pathologies`, Fase 6)

26 casi, ognuno con uno slider di gravità (lieve → grave) che interpola in modo continuo parametri e
morfologia (spessore di parete nella scena), e una scheda didattica: fisiopatologia, emodinamica attesa,
segni ecocardiografici, obiettivi anestesiologici (FC, precarico, postcarico, contrattilità: cosa fare / cosa
evitare), messaggio chiave e prove da fare nel simulatore. Avvisi contestuali (`alerts.ts`) interpretano lo
stato corrente (es. EVR < 0.5 nella stenosi aortica, inotropi nella CMIO, nitrati nell'infarto del VD).

| Categoria    | Casi                                                                                                         |
| ------------ | ------------------------------------------------------------------------------------------------------------ |
| Valvulopatie | Stenosi aortica, insufficienza aortica cronica, stenosi mitralica, IM acuta e cronica, IT, stenosi polmonare |
| Miocardio    | HFrEF, HFpEF, CMIO con SAM (gradiente dinamico), infarto del VD, infarto anteriore esteso                    |
| Pericardio   | Tamponamento (polso paradosso, equalizzazione), pericardite costrittiva (dip-and-plateau)                    |
| Polmonare    | Embolia massiva (dilatazione del VD, shift settale), ipertensione polmonare cronica                          |
| Shock        | Ipovolemico, settico/distributivo, cardiogeno, ostruttivo (pneumotorace iperteso)                            |
| Shunt        | DIA, DIV, dotto arterioso (particelle dello shunt evidenziate)                                               |
| Aritmie      | FA, bradicardia, tachicardia sopraventricolare, BAV III                                                      |

Terapia: boli di liquidi (250/500 mL), emorragia, propofol (1–2 mg/kg), noradrenalina, adrenalina,
dobutamina, vasopressina, esmololo, nitroglicerina, milrinone (comparsa graduale, barra della concentrazione
all'effettore), VPP/PEEP, pericardiocentesi, IABP 1:1 (pallone visibile nell'aorta discendente), stato del
baroriflesso. Ogni preset ha un test di direzione e monotonia (`tests/pathologies/presets.test.ts`).

**Perché tachicardia e vasodilatazione sono pericolose nella stenosi aortica:** l'orifizio fisso impedisce alla
gittata di aumentare. Ridurre le RVS abbassa quindi la pressione diastolica aortica (apporto coronarico = DPTI),
mentre la pressione sistolica del VS (domanda = SPTI) resta alta; la tachicardia accorcia la diastole. L'EVR
scende sotto la soglia di ischemia subendocardica (~0.5). Lo verifica `tests/physiology/reflex-drugs.test.ts`.

## Cuore 3D (`src/scene`)

### Modello anatomico reale (predefinito)

Il cuore mostrato deriva da **BodyParts3D**, mesh segmentate da dati TC di un soggetto adulto:

> BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International.

`scripts/build-anatomy.ts` produce offline `public/models/heart-bp3d.{json,bin}` (≈ 1.3 MB, circa
0.9 MB gzip):

1. carica le mesh reali (pareti atriali, cavità ventricolari, aorta con i tronchi sovraortici, tronco
   polmonare con i rami, cave, vene polmonari, coronarie e vene cardiache);
2. calcola campi di distanza con segno su una griglia a 1 mm, chiudendo i piccoli fori con una chiusura
   morfologica;
3. **ricostruisce l'epicardio ventricolare**, che BodyParts3D non contiene: offset della cavità reale del
   VS di 10 mm (6.5 mm all'apice) e del VD di 4 mm. Controllo di coerenza: le coronarie reali, che nella
   realtà decorrono sull'epicardio, cadono sulla superficie ricostruita (distanza mediana −0.5 mm, p10–p90
   da −1.4 a +2.0 mm);
4. unisce la ricostruzione ad atri e vasi, sezionati con estremità aperte;
5. estrae la superficie, la decima con meshoptimizer e quantizza gli attributi;
6. calcola per ogni vertice i pesi di regione per la deformazione, i riferimenti anatomici (apice, asse
   lungo, centri atriali, volumi delle cavità) e la distribuzione del grasso epicardico, che segue coronarie,
   vene, solco AV e radice dei vasi.

Rigenerazione, con gli OBJ di `partof_BP3D_4.0_obj_99` scaricati da https://dbarchive.biosciencedbc.jp/en/bodyparts3d/:

```bash
npx tsx scripts/build-anatomy.ts /percorso/partof_BP3D_4.0_obj_99
```

Il cuore procedurale basato su SDF (`scene/heart/anatomy.ts`) resta come fallback se l'asset non è disponibile.

### Rendering

- **Battito guidato dal motore**, nel vertex shader. Ogni vertice ha pesi di regione (VS, VD, AS, AD,
  aorta, AP, vene). Il fattore di scala epicardico è `S = (V + Vparete)/(Vrif + Vparete)`, perché il
  miocardio è incomprimibile; i volumi di riferimento sono quelli delle cavità reali del modello.
  - Ventricoli: accorciamento assiale ancorato all'apice (quindi discesa dell'anello AV) e radiale, più la
    torsione del VS proporzionale all'attivazione.
  - Atri: scala isotropa.
  - Aorta e AP: distensione radiale proporzionale alla pressione.
- **Superficie:** `MeshPhysicalMaterial` (clearcoat "umido", sheen) più dettaglio procedurale nel fragment
  shader, calcolato sulle coordinate del tessuto non deformato così la trama segue il battito:
  - striature lungo la direzione delle fibre epicardiche (elica a circa −60°);
  - vasellini subepicardici e chiazzature;
  - lobuli del grasso, più lucidi;
  - bordo traslucido rossastro come approssimazione della diffusione sottocutanea.
- **Illuminazione e post-processing:** tipo sala operatoria (lightformer procedurali, luce principale
  calda, controluce fredda), N8AO (occlusione ambientale), bloom leggero, SMAA, vignettatura, tone mapping
  ACES. Tre livelli di qualità (HQ/MQ/LQ), con declassamento automatico se il frame time peggiora e DPR
  adattivo.
- **Interfaccia:** cuore a pieno schermo, viste predefinite, OrbitControls touch, bottom sheet a tre
  livelli (pannello laterale in orizzontale).

### Strutture interne, valvole, flusso e sezioni (Fase 5)

- **Strutture interne reali (BodyParts3D):** superfici endocardiche chiuse delle 4 cavità, muscoli
  papillari e **11 lembi valvolari reali**. I lembi sono 2 della mitrale e 3 ciascuno per tricuspide,
  aortica e polmonare.
- **Lembi animati:** per ogni lembo la pipeline calcola la linea di cerniera sull'anulus e la distanza di
  ogni vertice dalla cerniera; nel vertex shader il lembo ruota attorno a quella linea. L'apertura segue
  il **flusso transvalvolare del motore** (inerzia di circa 20–30 ms).
  - Stenosi: apertura massima ∝ √(area/area normale).
  - Insufficienza: coaptazione incompleta ∝ √EROA.
- **Particelle di flusso** (5 000 / 12 000 / 24 000 secondo la qualità) lungo 11 percorsi anatomici:
  cave → AD → VD → tronco → rami polmonari; 4 vene polmonari → AS → VS → aorta, discendente e tronchi
  sovraortici.
  - I percorsi seguono la **linea centrale reale dei lumi**: cresta del campo di distanza con segno dalla
    parete, calcolata dopo aver rimosso i "tappi" tra i segmenti vascolari di BodyParts3D.
  - La **velocità** di ogni particella è `v = Q/A`: Q è il flusso del motore, interpolato tra l'ingresso e
    l'uscita di ciascun tratto e ripartito tra i rami; A è l'area locale del lume.
  - Integrazione sul tempo simulato, quindi rispettano pausa e rallenty. Le particelle seguono anche la
    deformazione del cuore.
  - Due colorazioni: **saturazione** (SaO₂ / SvO₂ calcolata) oppure **color-Doppler** (verso/lontano
    dall'osservatore, aliasing oltre 70 cm/s, mosaico nei flussi turbolenti). Oltre 1.5 m/s le particelle
    disperdono (getti).
- **Modalità di vista:**
  - esterna;
  - **sezione**: 4 camere, asse lungo parasternale o asse corto, con piano spostabile; il taglio del
    miocardio è chiuso con lo stencil buffer;
  - **raggi X**: epicardio ed endocardio trasparenti con effetto Fresnel;
  - **heatmap di pressione** sull'endocardio (0–140 mmHg);
  - **attivazione** elettromeccanica sincrona con l'ECG.
- **Etichette anatomiche:** con un doppio tap su una struttura compare il nome della regione (camera,
  vaso, valvola, papillare, coronaria o grasso epicardico).

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

## Confronto con il cuore normale (Fase 7)

Con «Confronto → Schermo diviso» (tab Vista 3D o Patologie) il worker esegue in parallelo un secondo motore
con i parametri normali, allo stesso passo temporale. La scena usa una sola camera e due viewport: a sinistra
il cuore normale, a destra il paziente, con la stessa vista, modalità, sezione e istante. Una tabella
affianca le grandezze chiave; gli scostamenti oltre il 15 % sono evidenziati. In questa modalità il
post-processing è disattivato (tone mapping nel renderer) per restare fluidi su iPhone. Quando l'app va in
background il motore si ferma.

## Approssimazioni del modello

Da leggere prima di usare il simulatore per la didattica.

- **Parametri concentrati:** nessuna propagazione né riflessione d'onda (salvo l'effetto di Zc), nessun
  gradiente centro-periferia; la "PA" è la pressione aortica prossimale.
- **Baroriflesso semplificato:** un solo sensore (PAM aortica filtrata, τ 2 s), set-point fisso (99.5 mmHg,
  il valore normale del modello), effettori lineari nell'errore frazionale con costanti di tempo e limiti
  fissi. Mancano chemocettori, recettori cardiopolmonari, RAAS e adattamenti a lungo termine; il set-point non
  si resetta. Nel tamponamento le pressioni si equalizzano a ~10 mmHg invece dei 15–20 clinici (la
  venocostrizione modellata è limitata a −12 % del volume unstressed).
- **Farmaci:** una sola costante di tempo per la comparsa dell'effetto (nessun modello multi-compartimentale,
  nessuna eliminazione dopo la sospensione diversa dalla comparsa), effetti Emax moltiplicativi indipendenti
  (nessuna interazione recettoriale). Dosi, EC50 e ampiezze sono tarati su direzione e ordine di grandezza
  clinici, non su dati di farmacocinetica individuale. Propofol: plasma → effettore τ 45 s, ridistribuzione
  τ 300 s; riduce RVS, tono venoso, contrattilità e guadagno del riflesso.
- **Boli di liquidi:** infusi a velocità accelerata (250 mL/min) per restare in tempi didattici; nessuna
  ridistribuzione interstiziale.
- **IABP:** il pallone sottrae volume al compartimento arterioso sistemico (unico, senza posizione lungo
  l'aorta); gonfiaggio/sgonfiaggio con τ 35 ms, temporizzazione ideale.
- **CMIO:** l'ostruzione dinamica è un'area del LVOT che si riduce con il volume del VS (smoothstep); il SAM e
  l'IM sono accoppiati solo tramite un EROA fisso.
- **Preset delle patologie:** combinazioni di parametri scelte per riprodurre l'emodinamica tipica di ciascun
  quadro (verificata dai test di direzione), non adattate a pazienti reali. Gli adattamenti cronici (dilatazione,
  ipertrofia, espansione della volemia) sono impliciti nei parametri. Nella pericardite costrittiva la
  rigidità pericardica è limitata dalla stabilità numerica (vk ≥ 6 mL). Le onde "a cannone" del BAV III sono
  presenti ma modeste (~+3 mmHg) per l'elastanza atriale calibrata sul normale.
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
- **Ossigenazione:** VO₂ costante, SaO₂ fissa per preset (98 % nel normale; ridotta dai preset di embolia,
  ipertensione polmonare e pneumotorace), O₂ disciolto trascurato, nessun effetto dello shunt sulla SaO₂.
- **Ritmo:** la durata dell'attivazione ventricolare scala con √RR; in FA l'RR è estratto da una
  gaussiana troncata (CV 20 %) con PRNG deterministico.
- **Coronarie, autoregolazione e ischemia:** non modellate nel motore; il bilancio O₂ subendocardico è solo
  un indice (EVR di Buckberg calcolato con la pressione del VS invece di quella atriale), non retroagisce sulla
  contrattilità.
- **ECG:** sintetico (somma di gaussiane agganciate agli eventi del motore), non elettrofisiologico.
- **Fonocardiogramma:** schematico. S1 ed S2 compaiono alla chiusura valvolare e la loro ampiezza è
  proporzionale a dP/dt e alla pressione a valle. S3 e S4 usano soglie euristiche sulla pressione atriale
  sinistra e sulla PTD del VS (> 14 mmHg). I soffi sono rumore proporzionale alla velocità del getto oltre 2 m/s.
- **Pletismografia:** pressione arteriosa filtrata passa-basso (τ 120 ms), normalizzata: non modella
  vasomotilità periferica né perfusione.
- **Curva di Frank-Starling:** calcolata in apnea variando istantaneamente la volemia (8 s di transitorio
  per punto). Il punto di lavoro è misurato con la ventilazione corrente, quindi può discostarsi di poco.
- **Onde della CVP:** l'escursione a-v del modello (~8 mmHg) è maggiore di quella clinica (3–5 mmHg).
- **Anatomia 3D:** atri, vasi, coronarie e cavità vengono da un soggetto reale (BodyParts3D). L'epicardio
  ventricolare è invece **ricostruito** per offset delle cavità con spessori di parete tipici (VS 10 mm,
  VD 4 mm), non misurato. Il grasso epicardico è distribuito in modo euristico (vicino ai vasi, solco AV,
  radice dei vasi). La mesh è decimata a circa 38 000 vertici per iPhone.
- **Particelle di flusso:** mostrano la velocità media nel lume (Q/A) lungo percorsi prestabiliti.
  Non è una simulazione CFD: vortici, profili di velocità e ricircoli non sono calcolati, e i getti
  sono solo una dispersione proporzionale alla velocità. Nelle camere il percorso è schematico
  (afflusso → apice → efflusso).
- **Valvole:** i lembi ruotano rigidamente attorno alla cerniera (con curvatura proporzionale alla distanza
  dall'anulus), senza modello strutturale né corde tendinee. La posa di riposo del modello BodyParts3D è
  stimata.
- **Dettaglio di superficie:** fibre, vasellini e lobuli del grasso sono procedurali (rumore), non
  fotografati; la direzione delle fibre è un'elica a −60° semplificata.
- **Deformazione 3D:** è cinematica, non meccanica, e non viene da un modello a elementi finiti. Le frazioni
  assiale e radiale dell'accorciamento (esponenti 0.3/0.35), la torsione massima (≈ 11°) e la distensibilità
  visiva dei vasi sono scelte per plausibilità. I volumi delle camere sono invece quelli del motore. Con un
  modello GLB esterno la deformazione è per mesh (scala attorno al baricentro), quindi più grossolana.
- **Morfologia delle patologie nella scena:** l'ipertrofia è un fattore di volume di parete che ispessisce
  l'epicardio in direzione radiale. Le cavità (endocardio, papillari, particelle) seguono il volume della cavità
  con lo stesso accorciamento assiale dell'epicardio. Lo spostamento del setto è un campo gaussiano attorno
  alla superficie media del setto, pari a 0.12 cm per mL di variazione del volume settale del motore (max
  ±1.2 cm): un'amplificazione visiva per rendere visibile il "D-shape".
- **Shunt nella scena:** DIA, DIV e dotto sono segmenti rettilinei posti dove i percorsi del flusso dei due
  circuiti sono più vicini, non difetti anatomici modellati. DIA e DIV sono spostati nel piano della sezione
  4 camere (0.5 cm dietro il taglio). Le loro particelle sono disegnate in sovrimpressione, senza test di
  profondità: il setto nel modello è integro e altrimenti coprirebbe il getto.
- **Setto nella scena:** il centro del setto è ricavato dallo spazio tra le cavità reali di VS e VD a metà
  ventricolo. Il pallone dell'IABP segue la centerline
  dell'aorta discendente del modello.
