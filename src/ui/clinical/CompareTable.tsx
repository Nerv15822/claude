import type { BeatMetrics } from '@physiology/metrics';
import { useSimulation } from '@store/simulation';
import styles from './Clinical.module.css';

type Row = [label: string, unit: string, value: (b: BeatMetrics) => number, digits?: number];

const ROWS: Row[] = [
  ['FC', 'bpm', (b) => b.hr],
  ['PAS', 'mmHg', (b) => b.aoSys],
  ['PAD', 'mmHg', (b) => b.aoDia],
  ['PAM', 'mmHg', (b) => b.aoMean],
  ['GC', 'L/min', (b) => b.co, 1],
  ['GS anterograda', 'mL', (b) => b.forwardSv],
  ['FE VS', '%', (b) => b.ef * 100],
  ['VTD VS', 'mL', (b) => b.lvEdv],
  ['PTDVS', 'mmHg', (b) => b.lvEdp],
  ['PCWP (AS)', 'mmHg', (b) => b.laMean],
  ['PVC (AD)', 'mmHg', (b) => b.raMean],
  ['PAP media', 'mmHg', (b) => b.paMean],
  ['VTD VD', 'mL', (b) => b.rvEdv],
  ['RVS', 'dyn·s·cm⁻⁵', (b) => b.svr],
  ['SvO₂', '%', (b) => b.svo2 * 100],
  ['EVR', '', (b) => b.evr, 2],
];

/** Tabella affiancata cuore normale / paziente (modalità confronto). */
export function CompareTable() {
  const b = useSimulation((s) => s.beat);
  const r = useSimulation((s) => s.refBeat);
  if (!b || !r) return <p className={styles.text}>Avvio del cuore di riferimento…</p>;
  return (
    <table className={styles.compare}>
      <thead>
        <tr>
          <th />
          <th>Normale</th>
          <th>Paziente</th>
        </tr>
      </thead>
      <tbody>
        {ROWS.map(([label, unit, f, d = 0]) => {
          const vn = f(r);
          const vp = f(b);
          const rel = Math.abs(vn) > 1e-6 ? (vp - vn) / Math.abs(vn) : 0;
          const cls = rel > 0.15 ? styles.higher : rel < -0.15 ? styles.lower : '';
          return (
            <tr key={label}>
              <th scope="row">
                {label} <small>{unit}</small>
              </th>
              <td>{vn.toFixed(d)}</td>
              <td className={cls}>
                {vp.toFixed(d)} {rel > 0.15 ? '↑' : rel < -0.15 ? '↓' : ''}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
