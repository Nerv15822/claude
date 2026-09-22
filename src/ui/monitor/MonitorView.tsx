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

/** Vista "monitor multiparametrico": tracciati scorrevoli sincronizzati + parametri derivati. */
export function MonitorView() {
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <StripChart lanes={LANES} height={Math.min(560, Math.max(380, window.innerHeight * 0.55))} />
      <NumericMonitor />
    </div>
  );
}
