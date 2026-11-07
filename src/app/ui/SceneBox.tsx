import { Suspense, lazy } from 'react';
import { useStore } from '../store';

const HeartScene = lazy(() => import('../scene/HeartScene'));

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
