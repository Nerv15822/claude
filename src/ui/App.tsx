import styles from './App.module.css';

export function App() {
  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <h1>CardioSim 3D</h1>
        <span className={styles.tag}>Fase 1 · scaffold</span>
      </header>
      <main className={styles.main}>
        <p>Simulatore emodinamico del cuore per specializzandi in Anestesia e Rianimazione.</p>
        <p className={styles.muted}>Il motore fisiologico arriva nella Fase 2.</p>
      </main>
    </div>
  );
}
