import { Suspense, lazy } from 'react';
import { useStore } from '../store';

const HeartScene = lazy(() => import('../scene/HeartScene'));

const ANALYTIC_SCALE: Record<string, { label: string; max: string }> = {
  stress: { label: 'Stress parietale (Laplace, P·r)', max: 'alto' },
  perfusione: { label: 'Perfusione coronarica', max: '0.6 L/min' },
  mvo2: { label: 'MVO₂', max: '60 mL/min' },
};

/** Legenda numerica della modalità analitica (colormap viridis, percettivamente uniforme). */
function AnalyticLegend({ which }: { which: string }) {
  const s = ANALYTIC_SCALE[which] ?? ANALYTIC_SCALE.stress!;
  return (
    <div
      style={{
        position: 'absolute',
        left: 10,
        bottom: 10,
        padding: '6px 8px',
        borderRadius: 8,
        background: 'rgba(8,12,18,0.72)',
        border: '1px solid rgba(255,255,255,0.14)',
        color: '#dbe6f3',
        fontSize: 10.5,
        maxWidth: 190,
      }}
    >
      <div style={{ marginBottom: 4 }}>{s.label}</div>
      <div
        style={{
          height: 8,
          borderRadius: 4,
          background: 'linear-gradient(90deg,#440154,#31688e,#35b779,#fde725)',
        }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
        <span>0</span>
        <span>{s.max}</span>
      </div>
    </div>
  );
}

export function SceneBox() {
  const viewMode = useStore((s) => s.viewMode);
  const setViewMode = useStore((s) => s.setViewMode);
  const showSection = useStore((s) => s.showSection);
  const setShowSection = useStore((s) => s.setShowSection);
  const bloom = useStore((s) => s.bloom);
  const setBloom = useStore((s) => s.setBloom);
  const analyticVar = useStore((s) => s.analyticVar);
  const setAnalyticVar = useStore((s) => s.setAnalyticVar);
  return (
    <div className="em-scene">
      <div className="em-scene-badge">
        Cuore 3D · modalità {viewMode}
        {viewMode === 'analitica' ? ` · ${analyticVar}` : ''}
      </div>
      <Suspense fallback={null}>
        <HeartScene />
      </Suspense>
      {viewMode === 'analitica' ? <AnalyticLegend which={analyticVar} /> : null}
      <div className="em-scene-controls">
        {viewMode === 'analitica' ? (
          <select
            className="em-chip"
            value={analyticVar}
            onChange={(e) => setAnalyticVar(e.target.value as 'stress' | 'perfusione' | 'mvo2')}
            aria-label="grandezza analitica"
          >
            <option value="stress">stress parietale</option>
            <option value="perfusione">perfusione</option>
            <option value="mvo2">MVO₂</option>
          </select>
        ) : (
          <button className={`em-chip ${bloom ? 'on' : ''}`} onClick={() => setBloom(!bloom)}>
            bloom
          </button>
        )}
        <button className={`em-chip ${showSection ? 'on' : ''}`} onClick={() => setShowSection(!showSection)}>
          sezione
        </button>
        <button
          className="em-chip on"
          onClick={() => setViewMode(viewMode === 'estetica' ? 'analitica' : 'estetica')}
        >
          {viewMode === 'estetica' ? 'estetica' : 'analitica'}
        </button>
      </div>
    </div>
  );
}
