import type { Lane } from '../charts/StripChart';
import { StripChart } from '../charts/StripChart';
import { NumericMonitor } from './NumericMonitor';

const r0 = (x: number) => Math.round(x).toString();

const LANES: Lane[] = [
  {
    field: 'ecg',
    label: 'II',
    color: 'var(--ecg)',
    range: [-0.6, 1.6],
    value: (b) => r0(b.hr),
    unit: 'FC',
    weight: 1.2,
  },
  {
    field: 'pAo',
    label: 'ABP',
    color: 'var(--abp)',
    value: (b) => `${r0(b.aoSys)}/${r0(b.aoDia)}`,
    unit: `mmHg`,
    weight: 1.2,
  },
  {
    field: 'pPA',
    label: 'PAP',
    color: 'var(--pap)',
    value: (b) => `${r0(b.paSys)}/${r0(b.paDia)}`,
    unit: 'mmHg',
  },
  { field: 'pLA', label: 'PCWP (≈ AS)', color: 'var(--pcwp)', value: (b) => r0(b.laMean), unit: 'mmHg' },
  { field: 'pRA', label: 'CVP', color: 'var(--cvp)', value: (b) => r0(b.raMean), unit: 'mmHg' },
  {
    field: 'pleth',
    label: 'Pleth',
    color: 'var(--spo2)',
    normalize: true,
    value: (b) => `${r0(b.aoMean)}`,
    unit: 'PAM',
    weight: 0.8,
  },
];

const COMPACT = LANES.filter((l) => l.field === 'ecg' || l.field === 'pAo' || l.field === 'pRA');

/** Vista "monitor multiparametrico": tracciati scorrevoli sincronizzati + parametri derivati. */
export function MonitorView({ height }: { height: number }) {
  const compact = height < 300;
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <StripChart
        lanes={compact ? COMPACT : LANES}
        height={compact ? Math.max(120, height) : Math.min(560, height)}
      />
      <NumericMonitor />
    </div>
  );
}
