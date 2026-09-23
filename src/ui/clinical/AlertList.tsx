import { useMemo } from 'react';
import { valutaAvvisi } from '@pathologies/alerts';
import { useSimulation } from '@store/simulation';
import styles from './Clinical.module.css';

/** Avvisi didattici contestuali (patologia + stato emodinamico + terapie in corso). */
export function AlertList() {
  const b = useSimulation((s) => s.beat);
  const p = useSimulation((s) => s.params);
  const caseId = useSimulation((s) => s.caseId);
  const alerts = useMemo(() => (b ? valutaAvvisi(caseId, b, p) : []), [b, p, caseId]);
  if (alerts.length === 0) return null;
  return (
    <div className={styles.alerts} role="status" aria-live="polite">
      {alerts.map((a) => (
        <div key={a.id} className={`${styles.alert} ${styles[a.livello]}`}>
          <strong>{a.titolo}</strong>
          <p>{a.testo}</p>
        </div>
      ))}
    </div>
  );
}
