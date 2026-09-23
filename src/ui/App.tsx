import { lazy, Suspense, useEffect, useState } from 'react';
import { startAnalysis } from '@store/analysis';
import { startEngine, useSimulation } from '@store/simulation';
import { useView, type ViewPreset } from '@scene/viewStore';
import styles from './App.module.css';
import { PVLoop } from './charts/PVLoop';
import { StarlingCurve } from './charts/StarlingCurve';
import { WiggersDiagram } from './charts/WiggersDiagram';
import { ControlPanel } from './controls/ControlPanel';
import { ViewPanel } from './controls/ViewPanel';
import { Segmented } from './controls/Slider';
import { BottomSheet, type SheetLevel } from './layout/BottomSheet';
import { HemodynamicTable } from './monitor/HemodynamicTable';
import { MonitorView } from './monitor/MonitorView';

// La scena 3D (three.js) è caricata in modo differito: il bundle iniziale resta leggero.
const HeartScene = lazy(() => import('@scene/HeartScene').then((m) => ({ default: m.HeartScene })));

type Tab = 'monitor' | 'vista' | 'wiggers' | 'pv' | 'starling' | 'dati' | 'controlli';
const TABS: readonly (readonly [Tab, string])[] = [
  ['monitor', 'Monitor'],
  ['vista', 'Vista 3D'],
  ['controlli', 'Controlli'],
  ['wiggers', 'Wiggers'],
  ['pv', 'Loop PV'],
  ['starling', 'Starling'],
  ['dati', 'Dati'],
];
const VIEWS: readonly (readonly [ViewPreset, string])[] = [
  ['anteriore', 'Ant'],
  ['sinistra', 'Lat'],
  ['posteriore', 'Post'],
  ['apice', 'Apice'],
  ['base', 'Base'],
];

function SheetContent({ tab, height }: { tab: Tab; height: number }) {
  const [side, setSide] = useState<'left' | 'right'>('left');
  const sideToggle = (
    <Segmented
      label=""
      value={side}
      options={[
        ['left', 'Cuore sinistro'],
        ['right', 'Cuore destro'],
      ]}
      onChange={setSide}
    />
  );
  const h = Math.max(260, Math.min(520, height - 70));
  switch (tab) {
    case 'monitor':
      return <MonitorView height={height - 8} />;
    case 'wiggers':
      return (
        <>
          {sideToggle}
          <WiggersDiagram side={side} height={h} />
          <p className={styles.note}>
            Ultimo battito completo. CI = contrazione isovolumetrica, RI = rilasciamento isovolumetrico. Usa
            il rallenty per seguire le fasi.
          </p>
        </>
      );
    case 'pv':
      return (
        <>
          {sideToggle}
          <PVLoop side={side} height={h} />
          <p className={styles.note}>
            ESPVR ed EDPVR sono le relazioni transmurali del modello; il loop è in pressione assoluta (include
            pressione pleurica e pericardica). Ea = Pes/VS, elastanza arteriosa effettiva.
          </p>
        </>
      );
    case 'starling':
      return (
        <>
          <StarlingCurve height={h} />
          <p className={styles.note}>
            Curva calcolata sul modello con i parametri correnti variando la volemia (in apnea). Il punto
            rosso è il battito attuale.
          </p>
        </>
      );
    case 'dati':
      return <HemodynamicTable />;
    case 'controlli':
      return <ControlPanel />;
    case 'vista':
      return <ViewPanel />;
  }
}

const SHEET_FRACTIONS = [0.3, 0.56, 0.9];

export function App() {
  const paused = useSimulation((s) => s.paused);
  const speed = useSimulation((s) => s.speed);
  const setPaused = useSimulation((s) => s.setPaused);
  const setSpeed = useSimulation((s) => s.setSpeed);
  const reset = useSimulation((s) => s.reset);
  const setPreset = useView((s) => s.setPreset);
  const quality = useView((s) => s.quality);
  const setQuality = useView((s) => s.setQuality);
  const preset = useView((s) => s.preset);
  const [tab, setTab] = useState<Tab>('monitor');
  const [level, setLevel] = useState<SheetLevel>(0);
  const [vh, setVh] = useState(window.innerHeight);

  useEffect(() => {
    startEngine();
    startAnalysis();
    const onResize = () => setVh(window.innerHeight);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const landscape = window.innerWidth > window.innerHeight && window.innerWidth >= 700;
  const contentHeight = (landscape ? vh : SHEET_FRACTIONS[level]! * vh) - (landscape ? 70 : 84);

  return (
    <div className={styles.app}>
      <div className={styles.stage}>
        <Suspense fallback={null}>
          <HeartScene />
        </Suspense>
      </div>

      <header className={styles.topbar}>
        <div className={styles.brand}>
          <h1>CardioSim 3D</h1>
        </div>
        <div className={styles.actions}>
          <button onClick={() => setPaused(!paused)} aria-label={paused ? 'Riprendi' : 'Pausa'}>
            {paused ? '▶' : '❚❚'}
          </button>
          <button
            onClick={() => setSpeed(speed === 1 ? 0.25 : 1)}
            className={speed !== 1 ? styles.on : ''}
            aria-label="Rallenty"
          >
            {speed === 1 ? '0.25×' : '1×'}
          </button>
          <button
            onClick={() => setQuality(quality === 'alta' ? 'media' : quality === 'media' ? 'bassa' : 'alta')}
            aria-label={`Qualità grafica ${quality}`}
            title="Qualità grafica"
          >
            {quality === 'alta' ? 'HQ' : quality === 'media' ? 'MQ' : 'LQ'}
          </button>
          <button onClick={reset} aria-label="Reset">
            ↺
          </button>
        </div>
      </header>

      <nav className={styles.views} aria-label="Viste">
        {VIEWS.map(([id, label]) => (
          <button key={id} className={preset === id ? styles.on : ''} onClick={() => setPreset(id)}>
            {label}
          </button>
        ))}
      </nav>

      <BottomSheet
        level={level}
        onLevel={setLevel}
        header={
          <nav className={styles.tabs} role="tablist">
            {TABS.map(([id, label]) => (
              <button
                key={id}
                role="tab"
                aria-selected={tab === id}
                className={tab === id ? styles.tabOn : ''}
                onClick={() => {
                  setTab(id);
                  if (level === 0 && id !== 'monitor') setLevel(1);
                }}
              >
                {label}
              </button>
            ))}
          </nav>
        }
      >
        <SheetContent tab={tab} height={contentHeight} />
      </BottomSheet>
    </div>
  );
}
