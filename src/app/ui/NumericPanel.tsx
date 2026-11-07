import type { BeatMetrics, OxygenState } from '../../engine';
import { useStore } from '../store';
import { deltaLabel, direction, fmt } from './format';

interface TileProps {
  k: string;
  v: string;
  u?: string;
  now?: number | undefined;
  base?: number | undefined;
  digits?: number;
}
function Tile({ k, v, u, now, base, digits = 0 }: TileProps) {
  const dir = now !== undefined ? direction(now, base) : 'flat';
  return (
    <div className="em-tile">
      <div className="k">{k}</div>
      <div className="v">
        {v}
        {u ? <span className="u"> {u}</span> : null}
      </div>
      {now !== undefined && base !== undefined ? (
        <div className={`d ${dir}`}>{deltaLabel(now, base, digits)}</div>
      ) : null}
    </div>
  );
}

export function NumericPanel() {
  const beat = useStore((s) => s.beat);
  const base = useStore((s) => s.baseline);
  const ox = useStore((s) => s.oxygen);
  const oxBase = useStore((s) => s.baselineOxygen);
  if (!beat) return <div className="em-card em-empty">In avvio…</div>;
  const b = beat as BeatMetrics;
  const o = ox as OxygenState | null;
  return (
    <div className="em-card">
      <h2>Monitoraggio · Δ rispetto al basale</h2>
      <div className="em-grid">
        <Tile k="MAP" v={fmt(b.map)} u="mmHg" now={b.map} base={base?.map} />
        <Tile k="PA" v={`${fmt(b.pas)}/${fmt(b.pad)}`} u="mmHg" />
        <Tile k="FC" v={fmt(b.hr)} u="bpm" now={b.hr} base={base?.hr} />
        <Tile k="CO" v={fmt(b.co, 1)} u="L/min" now={b.co} base={base?.co} digits={1} />
        <Tile k="SV" v={fmt(b.sv)} u="mL" now={b.sv} base={base?.sv} />
        <Tile k="FE VS" v={fmt(b.lvef)} u="%" now={b.lvef} base={base?.lvef} />
        <Tile k="PVC" v={fmt(b.cvp, 1)} u="mmHg" now={b.cvp} base={base?.cvp} digits={1} />
        <Tile k="PAOP" v={fmt(b.paop, 1)} u="mmHg" now={b.paop} base={base?.paop} digits={1} />
        <Tile k="PAP" v={`${fmt(b.paps)}/${fmt(b.papd)}`} u="mmHg" />
        <Tile k="SVR" v={fmt(b.svr)} u="dyn·s·cm⁻⁵" now={b.svr} base={base?.svr} />
        <Tile k="PVR" v={fmt(b.pvr)} u="dyn·s·cm⁻⁵" now={b.pvr} base={base?.pvr} />
        <Tile k="Ea/Ees" v={fmt(b.eaOverEes, 2)} now={b.eaOverEes} base={base?.eaOverEes} digits={2} />
        {o ? (
          <>
            <Tile k="DO₂" v={fmt(o.do2)} u="mL/min" now={o.do2} base={oxBase?.do2} />
            <Tile k="VO₂" v={fmt(o.vo2)} u="mL/min" />
            <Tile k="SvO₂" v={fmt(o.svo2 * 100)} u="%" now={o.svo2} base={oxBase?.svo2} digits={2} />
            <Tile k="SpO₂" v={fmt(o.spo2 * 100)} u="%" />
            <Tile
              k="Lattato"
              v={fmt(o.lactate, 1)}
              u="mmol/L"
              now={o.lactate}
              base={oxBase?.lactate}
              digits={1}
            />
            <Tile k="EVR" v={fmt(o.evr, 2)} now={o.evr} base={oxBase?.evr} digits={2} />
          </>
        ) : null}
      </div>
    </div>
  );
}
