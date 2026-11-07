import { useStore } from '../store';

export function AlertBanner() {
  const alerts = useStore((s) => s.alerts);
  return (
    <div className="em-card">
      <h2>Effetti collaterali attivi</h2>
      {alerts.length === 0 ? (
        <div className="em-empty">Nessun effetto collaterale rilevante allo stato attuale.</div>
      ) : (
        alerts.map((a) => (
          <div className={`em-alert ${a.gravita}`} key={a.id}>
            <div className="t">
              <span>{a.titolo}</span>
              <span className="sev">{a.gravita}</span>
            </div>
            <div className="m">{a.meccanismo}</div>
            <div className="var">{a.variabile}</div>
          </div>
        ))
      )}
    </div>
  );
}
