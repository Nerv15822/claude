import { useSimulation } from '@store/simulation';
import styles from './HemodynamicTable.module.css';

const n = (x: number, d = 0) => (Number.isFinite(x) ? x.toFixed(d) : '--');

/** Tabella dettagliata di pressioni, volumi e indici derivati dell'ultimo battito. */
export function HemodynamicTable() {
  const b = useSimulation((s) => s.beat);
  if (!b) return <p className={styles.wait}>Avvio del motore…</p>;
  const rows: [string, string, string][] = [
    ['Ventricolo sinistro', `${n(b.lvSys)}/${n(b.lvEdp)} mmHg`, `VTD ${n(b.lvEdv)} · VTS ${n(b.lvEsv)} mL`],
    ['Ventricolo destro', `${n(b.rvSys)}/${n(b.rvEdp)} mmHg`, `VTD ${n(b.rvEdv)} · VTS ${n(b.rvEsv)} mL`],
    ['Atrio sinistro', `media ${n(b.laMean)} · max ${n(b.laMax)}`, 'mmHg'],
    ['Atrio destro', `media ${n(b.raMean)} · max ${n(b.raMax)}`, 'mmHg'],
    ['FE VS / VD', `${n(b.ef * 100)} % / ${n(b.rvEf * 100)} %`, ''],
    ['Lavoro sistolico VS', `${n(b.strokeWork * 1.333e-4, 2)} J`, `${n(b.strokeWork)} mmHg·mL`],
    ['RVS / RVP', `${n(b.svr)} / ${n(b.pvr)}`, 'dyn·s·cm⁻⁵'],
    ['Gradiente VS–aorta', `medio ${n(b.avMeanGradient)} · picco ${n(b.avPeakGradient)}`, 'mmHg'],
    ['Gradiente mitralico', `medio ${n(b.mvMeanGradient, 1)}`, 'mmHg'],
    ['Gradiente polmonare', `medio ${n(b.pvMeanGradient)} · picco ${n(b.pvPeakGradient)}`, 'mmHg'],
    [
      'Frazioni di rigurgito',
      `M ${n(b.mrFraction * 100)} · Ao ${n(b.arFraction * 100)} · T ${n(b.trFraction * 100)} · P ${n(b.prFraction * 100)}`,
      '%',
    ],
    ['Qp/Qs', n(b.qpqs, 2), ''],
    [
      'Shunt (DIA · DIV · PDA)',
      `${n(b.asdVolume, 1)} · ${n(b.vsdVolume, 1)} · ${n(b.pdaVolume, 1)}`,
      'mL/battito',
    ],
    ['Pressione pericardica', n(b.periMean, 1), 'mmHg'],
    ['Bilancio O₂ subendocardico', `EVR ${n(b.evr, 2)} (DPTI ${n(b.dpti)} / SPTI ${n(b.spti)})`, 'mmHg·s'],
    ['Perfusione coronarica', `${n(b.aoDia - b.lvEdp)} (P dia Ao − PTDVS)`, 'mmHg'],
  ];
  return (
    <>
      <table className={styles.table}>
        <tbody>
          {rows.map(([k, v, u]) => (
            <tr key={k}>
              <th scope="row">{k}</th>
              <td>{v}</td>
              <td className={styles.unit}>{u}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className={styles.credits}>
        Anatomia 3D: BodyParts3D, © The Database Center for Life Science, licenza CC Attribution 4.0
        International. Epicardio ventricolare ricostruito dalle cavità reali (vedi README).
      </p>
    </>
  );
}
