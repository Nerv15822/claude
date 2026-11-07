import { useEffect, useState } from 'react';
import { SCENARIO_BY_ID } from './scenarios';
import { useStore } from './store';
import { AlertBanner } from './ui/AlertBanner';
import { ChallengeView } from './ui/ChallengeView';
import { CompareView } from './ui/CompareView';
import { ControlBar } from './ui/ControlBar';
import { DrugCard } from './ui/DrugCard';
import { NumericPanel } from './ui/NumericPanel';
import { RegionalFlows } from './ui/RegionalFlows';
import { SceneBox } from './ui/SceneBox';
import { GuytonDiagram, PVLoops, StripTrace } from './ui/charts';

type Mode = 'sim' | 'compare' | 'challenge';

function SimView() {
  const scenarioId = useStore((s) => s.scenarioId);
  const scenario = SCENARIO_BY_ID[scenarioId];
  return (
    <>
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
    </>
  );
}

export function EmodinamicaApp() {
  const init = useStore((s) => s.init);
  const [mode, setMode] = useState<Mode>('sim');
  useEffect(() => {
    init();
  }, [init]);

  return (
    <div className="em-app">
      <div className="em-title">
        <h1>Emodinamica</h1>
        <span>simulatore cardiovascolare · didattico</span>
      </div>

      <div className="em-seg" role="tablist" style={{ alignSelf: 'center' }}>
        <button className={mode === 'sim' ? 'on' : ''} onClick={() => setMode('sim')}>
          Simulatore
        </button>
        <button className={mode === 'compare' ? 'on' : ''} onClick={() => setMode('compare')}>
          Confronto
        </button>
        <button className={mode === 'challenge' ? 'on' : ''} onClick={() => setMode('challenge')}>
          Sfida
        </button>
      </div>

      {mode === 'sim' ? <SimView /> : mode === 'compare' ? <CompareView /> : <ChallengeView />}

      <p className="em-note" style={{ textAlign: 'center', padding: '4px 8px 0' }}>
        Modello <b>qualitativamente corretto</b> e <b>quantitativamente indicativo</b>. Gli EC50 recettoriali
        in vivo nell'uomo sono mal caratterizzati in letteratura. Strumento <b>didattico, non decisionale</b>.
      </p>
    </div>
  );
}
