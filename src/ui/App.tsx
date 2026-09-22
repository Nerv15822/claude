import { useEffect } from 'react';
import { startEngine, useSimulation } from '@store/simulation';
import styles from './App.module.css';
import { ControlPanel } from './controls/ControlPanel';
import { HemodynamicTable } from './monitor/HemodynamicTable';
import { MiniTrace } from './monitor/MiniTrace';
import { NumericMonitor } from './monitor/NumericMonitor';

export function App() {
  const paused = useSimulation((s) => s.paused);
  const speed = useSimulation((s) => s.speed);
  const setPaused = useSimulation((s) => s.setPaused);
  const setSpeed = useSimulation((s) => s.setSpeed);
  const reset = useSimulation((s) => s.reset);

  useEffect(() => startEngine(), []);

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <h1>CardioSim 3D</h1>
        <span className={styles.tag}>Fase 2 · motore emodinamico</span>
      </header>

      <div className={styles.toolbar}>
        <button onClick={() => setPaused(!paused)}>{paused ? '▶ Riprendi' : '❚❚ Pausa'}</button>
        <button onClick={() => setSpeed(speed === 1 ? 0.25 : 1)} className={speed !== 1 ? styles.on : ''}>
          {speed === 1 ? 'Rallenty 0.25×' : 'Velocità 1×'}
        </button>
        <button onClick={reset}>↺ Reset</button>
      </div>

      <NumericMonitor />

      <div className={styles.traces}>
        <MiniTrace
          field="pAo"
          color="var(--abp)"
          min={0}
          max={200}
          label="Pressione arteriosa (mmHg, 0–200)"
        />
        <MiniTrace field="pPA" color="var(--pap)" min={-5} max={60} label="PAP (mmHg, −5–60)" />
      </div>

      <div className={styles.columns}>
        <section className={styles.card}>
          <h2>Emodinamica dettagliata</h2>
          <HemodynamicTable />
        </section>
        <section className={styles.card}>
          <h2>Controlli</h2>
          <ControlPanel />
        </section>
      </div>
      <footer className={styles.footer}>
        Modello a parametri concentrati a scopo didattico. Le approssimazioni sono elencate nel README.
      </footer>
    </div>
  );
}
