import { useEffect, useMemo, useRef, useState } from 'react';
import { DRUGS, DRUG_IDS, type DrugId } from '../../engine';
import { SCENARIOS } from '../scenarios';
import type { CompareReq, CompareRes } from '../worker/compute.worker';
import { doseToSlider, fmt, sliderToDose } from './format';

function Arm({ label, res }: { label: string; res: CompareRes['a'] | null }) {
  if (!res) return <div className="em-tile">…</div>;
  const b = res.beat;
  const o = res.oxygen;
  const rows: [string, string][] = [
    ['MAP', `${fmt(b.map)} mmHg`],
    ['CO', `${fmt(b.co, 1)} L/min`],
    ['FC', `${fmt(b.hr)} bpm`],
    ['SVR', `${fmt(b.svr)}`],
    ['SvO₂', `${fmt(o.svo2 * 100)} %`],
    ['DO₂', `${fmt(o.do2)} mL/min`],
    ['Lattato', `${fmt(o.lactate, 1)}`],
    ['EVR', `${fmt(o.evr, 2)}`],
  ];
  return (
    <div className="em-tile" style={{ padding: 10 }}>
      <div className="k" style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>
        {label}
      </div>
      <table style={{ width: '100%', fontSize: 12.5, borderCollapse: 'collapse', marginTop: 6 }}>
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <td style={{ color: 'var(--muted)', padding: '2px 0' }}>{k}</td>
              <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {res.alerts[0] ? (
        <div className={`em-alert ${res.alerts[0].gravita}`} style={{ marginTop: 8 }}>
          <div className="t" style={{ fontSize: 12 }}>
            <span>{res.alerts[0].titolo}</span>
            <span className="sev">{res.alerts[0].gravita}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DrugPicker({
  which,
  id,
  dose,
  onId,
  onDose,
}: {
  which: string;
  id: DrugId;
  dose: number;
  onId: (v: DrugId) => void;
  onDose: (v: number) => void;
}) {
  const spec = DRUGS[id];
  return (
    <div className="em-field" style={{ flexBasis: '100%' }}>
      <label>
        <span>
          {which}: {spec.nome} · <b className="val">{dose < 1 ? dose.toFixed(3) : fmt(dose, 2)}</b>{' '}
          {spec.unita}
        </span>
      </label>
      <div className="em-row">
        <select value={id} onChange={(e) => onId(e.target.value as DrugId)} style={{ flex: '0 0 46%' }}>
          {DRUG_IDS.map((d) => (
            <option key={d} value={d}>
              {DRUGS[d].nome}
            </option>
          ))}
        </select>
        <input
          style={{ flex: 1 }}
          type="range"
          min={0}
          max={1}
          step={0.001}
          value={doseToSlider(dose, spec.max)}
          onChange={(e) => onDose(sliderToDose(Number(e.target.value), spec.max))}
        />
      </div>
    </div>
  );
}

export function CompareView() {
  const [scenarioId, setScenarioId] = useState('settico');
  const [aId, setAId] = useState<DrugId>('noradrenaline');
  const [aDose, setADose] = useState(0.2);
  const [bId, setBId] = useState<DrugId>('dopamine');
  const [bDose, setBDose] = useState(8);
  const [res, setRes] = useState<CompareRes | null>(null);
  const [busy, setBusy] = useState(false);
  const worker = useRef<Worker | null>(null);

  useEffect(() => {
    const w = new Worker(new URL('../worker/compute.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (ev: MessageEvent<CompareRes>) => {
      setRes(ev.data);
      setBusy(false);
    };
    worker.current = w;
    return () => w.terminate();
  }, []);

  const req = useMemo<CompareReq>(
    () => ({ scenarioId, a: { id: aId, dose: aDose }, b: { id: bId, dose: bDose } }),
    [scenarioId, aId, aDose, bId, bDose],
  );
  useEffect(() => {
    const t = setTimeout(() => {
      if (!worker.current) return;
      setBusy(true);
      worker.current.postMessage(req);
    }, 250);
    return () => clearTimeout(t);
  }, [req]);

  return (
    <>
      <div className="em-card">
        <h2>Confronto · due farmaci sullo stesso substrato</h2>
        <div className="em-field">
          <label>
            <span>Scenario (substrato)</span>
          </label>
          <select value={scenarioId} onChange={(e) => setScenarioId(e.target.value)}>
            {SCENARIOS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nome}
              </option>
            ))}
          </select>
        </div>
        <DrugPicker which="A" id={aId} dose={aDose} onId={setAId} onDose={setADose} />
        <DrugPicker which="B" id={bId} dose={bDose} onId={setBId} onDose={setBDose} />
      </div>
      <div className="em-card">
        <h2>Esito a regime {busy ? '· calcolo…' : ''}</h2>
        <div className="em-two">
          <Arm label={`A · ${DRUGS[aId].nome}`} res={res?.a ?? null} />
          <Arm label={`B · ${DRUGS[bId].nome}`} res={res?.b ?? null} />
        </div>
        <p className="em-note" style={{ marginTop: 8 }}>
          Stesso scenario, stessa gravità: le differenze emergono dai profili recettoriali dei due farmaci.
        </p>
      </div>
    </>
  );
}
