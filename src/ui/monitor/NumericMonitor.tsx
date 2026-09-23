import { useSimulation } from '@store/simulation';
import styles from './NumericMonitor.module.css';

const f0 = (x: number | undefined) =>
  x === undefined || !Number.isFinite(x) ? '--' : Math.round(x).toString();
const f1 = (x: number | undefined) => (x === undefined || !Number.isFinite(x) ? '--' : x.toFixed(1));

interface TileProps {
  label: string;
  value: string;
  sub?: string | undefined;
  unit?: string;
  color: string;
}

function Tile({ label, value, sub, unit, color }: TileProps) {
  return (
    <div className={styles.tile} style={{ color }}>
      <div className={styles.label}>
        {label}
        {unit && <span className={styles.unit}>{unit}</span>}
      </div>
      <div className={styles.value}>{value}</div>
      {sub && <div className={styles.sub}>{sub}</div>}
    </div>
  );
}

/** Valori principali in stile monitor multiparametrico. */
export function NumericMonitor() {
  const b = useSimulation((s) => s.beat);
  const r = useSimulation((s) => s.resp);
  const vent = useSimulation((s) => s.params.ventilation.mode);

  return (
    <section className={styles.grid} aria-label="Parametri derivati">
      <Tile
        label="GC"
        unit="L/min"
        color="var(--text)"
        value={f1(b?.co)}
        sub={b ? `VS ${f0(b.forwardSv)} mL` : undefined}
      />
      <Tile
        label="FE"
        unit="%"
        color="var(--text)"
        value={f0(b ? b.ef * 100 : undefined)}
        sub={b ? `VTD ${f0(b.lvEdv)} mL` : undefined}
      />
      <Tile label="SvO₂" unit="%" color="var(--spo2)" value={f0(b ? b.svo2 * 100 : undefined)} />
      <Tile
        label={vent === 'ppv' ? 'PPV' : 'ΔPAS resp.'}
        unit={vent === 'ppv' ? '%' : 'mmHg'}
        color="var(--muted-strong)"
        value={vent === 'ppv' ? f0(r?.ppv) : f0(r?.sbpVariation)}
        sub={r ? `SVV ${f0(r.svv)}%` : undefined}
      />
      <Tile
        label="RVS"
        unit="dyn·s·cm⁻⁵"
        color="var(--muted-strong)"
        value={f0(b?.svr)}
        sub={b ? `RVP ${f0(b.pvr)}` : undefined}
      />
    </section>
  );
}
