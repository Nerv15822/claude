import { useEffect } from 'react';
import { SCENARIO_BY_ID } from './scenarios';
import { useStore } from './store';
import { AlertBanner } from './ui/AlertBanner';
import { ControlBar } from './ui/ControlBar';
import { DrugCard } from './ui/DrugCard';
import { NumericPanel } from './ui/NumericPanel';
import { RegionalFlows } from './ui/RegionalFlows';
import { SceneBox } from './ui/SceneBox';
import { GuytonDiagram, PVLoops, StripTrace } from './ui/charts';

export function EmodinamicaApp() {
  const init = useStore((s) => s.init);
  const scenarioId = useStore((s) => s.scenarioId);
  useEffect(() => {
    init();
  }, [init]);
  const scenario = SCENARIO_BY_ID[scenarioId];

  return (
    <div className="em-app">
      <div className="em-title">
        <h1>Emodinamica</h1>
        <span>simulatore cardiovascolare · didattico</span>
      </div>

      <SceneBox />
      <ControlBar />

      {scenario ? (
        <div className="em-card">
          <h2>{scenario.nome}</h2>
          <p style={{ margin: '0 0 6px', fontSize: 14 }}>{scenario.sommario}</p>
          <p className="em-note" style={{ margin: 0 }}>
            {scenario.scheda}
          </p>
        </div>
      ) : null}

      <NumericPanel />

      <div className="em-card">
        <h2>Pressioni (aortica · polmonare)</h2>
        <StripTrace />
      </div>

      <div className="em-card">
        <h2>Loop pressione-volume</h2>
        <PVLoops />
      </div>

      <div className="em-card">
        <h2>Diagramma di Guyton</h2>
        <GuytonDiagram />
      </div>

      <RegionalFlows />
      <AlertBanner />
      <DrugCard />

      <p className="em-note" style={{ textAlign: 'center', padding: '4px 8px 0' }}>
        Modello <b>qualitativamente corretto</b> e <b>quantitativamente indicativo</b>. Gli EC50 recettoriali
        in vivo nell'uomo sono mal caratterizzati in letteratura. Strumento <b>didattico, non decisionale</b>.
      </p>
    </div>
  );
}
