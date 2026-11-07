import { DISTRICT_KEYS } from '../../engine';
import { useStore } from '../store';
import { DISTRICT_LABEL, fmt } from './format';

export function RegionalFlows() {
  const beat = useStore((s) => s.beat);
  if (!beat) return null;
  const max = Math.max(1.6, ...beat.districtFlow);
  return (
    <div className="em-card">
      <h2>Flussi regionali (sei distretti)</h2>
      {DISTRICT_KEYS.map((key, i) => {
        const q = beat.districtFlow[i] ?? 0;
        const frac = (beat.districtFraction[i] ?? 0) * 100;
        return (
          <div className="em-bar" key={key}>
            <span>{DISTRICT_LABEL[key]}</span>
            <span className="track">
              <span className="fill" style={{ width: `${Math.min(100, (q / max) * 100)}%` }} />
            </span>
            <span className="num">
              {fmt(q, 2)} L/min · {fmt(frac)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}
