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
- [ ] Fase 2 — motore fisiologico + validazione
- [ ] Fase 3 — tracciati, Wiggers, loop PV
- [ ] Fase 4 — cuore 3D procedurale
- [ ] Fase 5 — valvole, particelle, sezioni
- [ ] Fase 6 — patologie, interventi, schede didattiche
- [ ] Fase 7 — rifinitura grafica, performance, PWA

## Approssimazioni del modello
Vedi sezione dedicata (aggiornata a ogni fase).
