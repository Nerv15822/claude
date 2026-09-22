import { useEffect, useState } from 'react';
import { startAnalysis } from '@store/analysis';
import { startEngine, useSimulation } from '@store/simulation';
import styles from './App.module.css';
import { PVLoop } from './charts/PVLoop';
import { StarlingCurve } from './charts/StarlingCurve';
import { WiggersDiagram } from './charts/WiggersDiagram';
import { ControlPanel } from './controls/ControlPanel';
import { Segmented } from './controls/Slider';
import { HemodynamicTable } from './monitor/HemodynamicTable';
import { MonitorView } from './monitor/MonitorView';

type Tab = 'monitor' | 'wiggers' | 'pv' | 'starling' | 'dati' | 'controlli';
const TABS: readonly (readonly [Tab, string])[] = [
  ['monitor', 'Monitor'],
  ['wiggers', 'Wiggers'],
  ['pv', 'Loop PV'],
  ['starling', 'Starling'],
  ['dati', 'Dati'],
  ['controlli', 'Controlli'],
];

function ChartsView({ tab }: { tab: Tab }) {
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
  const h = Math.min(520, Math.max(360, window.innerHeight * 0.55));
  switch (tab) {
    case 'monitor':
      return <MonitorView />;
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
      return (
        <section className={styles.card}>
          <HemodynamicTable />
        </section>
      );
    case 'controlli':
      return (
        <section className={styles.card}>
          <ControlPanel />
        </section>
      );
  }
}

export function App() {
  const paused = useSimulation((s) => s.paused);
  const speed = useSimulation((s) => s.speed);
  const setPaused = useSimulation((s) => s.setPaused);
  const setSpeed = useSimulation((s) => s.setSpeed);
  const reset = useSimulation((s) => s.reset);
  const [tab, setTab] = useState<Tab>('monitor');

  useEffect(() => {
    startEngine();
    startAnalysis();
  }, []);

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <h1>CardioSim 3D</h1>
        <span className={styles.tag}>Fase 3 · tracciati</span>
      </header>

      <div className={styles.toolbar}>
        <button onClick={() => setPaused(!paused)}>{paused ? '▶ Riprendi' : '❚❚ Pausa'}</button>
        <button onClick={() => setSpeed(speed === 1 ? 0.25 : 1)} className={speed !== 1 ? styles.on : ''}>
          {speed === 1 ? 'Rallenty 0.25×' : 'Velocità 1×'}
        </button>
        <button onClick={reset}>↺ Reset</button>
      </div>

      <nav className={styles.tabs} role="tablist">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? styles.tabOn : ''}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      <main className={styles.main}>
        <ChartsView tab={tab} />
      </main>

      <footer className={styles.footer}>
        Modello a parametri concentrati a scopo didattico. Le approssimazioni sono elencate nel README.
      </footer>
    </div>
  );
}
