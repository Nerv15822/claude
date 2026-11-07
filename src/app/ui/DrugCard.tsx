import { DRUGS, type Receptor } from '../../engine';
import { useStore } from '../store';

const RLABEL: Record<Receptor, string> = {
  alpha1: 'α1',
  alpha2c: 'α2 centrale',
  alpha2p: 'α2 perif.',
  beta1: 'β1',
  beta2: 'β2',
  beta3: 'β3',
  D1: 'D1',
  D2: 'D2',
  V1a: 'V1a',
  V2: 'V2',
  PDE3: 'PDE3',
  caSens: 'sensib. Ca²⁺',
  kATP: 'K-ATP',
  noDirect: 'NO diretto',
  sGCi: 'inib. sGC',
  lCaBlock: 'blocco Ca-L',
};

export function DrugCard() {
  const id = useStore((s) => s.drugA);
  const ce = useStore((s) => s.status?.ce[id] ?? 0);
  const d = DRUGS[id];
  const agon = Object.entries(d.agonism ?? {}).map(([r, a]) => `${RLABEL[r as Receptor]} (EC50 ${a!.ec50})`);
  const block = Object.entries(d.block ?? {}).map(
    ([r, a]) => `blocco ${RLABEL[r as Receptor]} (EC50 ${a!.ec50})`,
  );
  const targets = [...agon, ...block].join(' · ') || '—';
  return (
    <div className="em-card em-drug">
      <h2>Scheda · {d.nome}</h2>
      <dl style={{ margin: 0 }}>
        <dt>Bersagli ed EC50 usati</dt>
        <dd>{targets}</dd>
        <dt>Dose clinica</dt>
        <dd>
          {d.doseClinica} · concentrazione all’effettore {ce.toFixed(ce < 1 ? 3 : 1)} {d.unita.split(' ')[0]}
        </dd>
        {d.controindicazioni ? (
          <>
            <dt>Controindicazioni</dt>
            <dd>{d.controindicazioni}</dd>
          </>
        ) : null}
        {d.erroriFrequenti ? (
          <>
            <dt>Errori frequenti</dt>
            <dd>{d.erroriFrequenti}</dd>
          </>
        ) : null}
        <dt>Fonte dei parametri</dt>
        <dd className="em-note">{d.fonte}</dd>
      </dl>
      {id === 'noradrenaline' ? (
        <p className="em-note" style={{ marginTop: 8 }}>
          Noradrenalina espressa come <b>base</b>: 1 mg base = 2 mg tartrato.
        </p>
      ) : null}
    </div>
  );
}
