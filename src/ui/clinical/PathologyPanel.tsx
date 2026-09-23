import { useState } from 'react';
import { CATEGORIE, PATHOLOGIES, PATHOLOGY_BY_ID, type Categoria, type Obiettivo } from '@pathologies/index';
import { useSimulation } from '@store/simulation';
import controls from '../controls/Controls.module.css';
import { Segmented } from '../controls/Slider';
import { AlertList } from './AlertList';
import { CompareTable } from './CompareTable';
import styles from './Clinical.module.css';

const GOALS: readonly (readonly ['fc' | 'precarico' | 'postcarico' | 'contrattilita', string])[] = [
  ['fc', 'Frequenza'],
  ['precarico', 'Precarico'],
  ['postcarico', 'Postcarico'],
  ['contrattilita', 'Contrattilità'],
];

function Goal({ label, g }: { label: string; g: Obiettivo }) {
  return (
    <div className={styles.goal}>
      <div className={styles.goalHead}>
        <span>{label}</span>
        <strong>{g.target}</strong>
      </div>
      {g.fare !== '—' && <p className={styles.do}>{g.fare}</p>}
      {g.evitare !== '—' && <p className={styles.avoid}>{g.evitare}</p>}
    </div>
  );
}

/** Scelta del caso clinico, gravità e scheda didattica. */
export function PathologyPanel() {
  const caseId = useSimulation((s) => s.caseId);
  const severity = useSimulation((s) => s.severity);
  const loadCase = useSimulation((s) => s.loadCase);
  const setSeverity = useSimulation((s) => s.setSeverity);
  const compare = useSimulation((s) => s.compare);
  const setCompare = useSimulation((s) => s.setCompare);
  const current = caseId ? PATHOLOGY_BY_ID[caseId] : undefined;
  const [cat, setCat] = useState<Categoria>(current?.categoria ?? 'valvolari');
  const list = PATHOLOGIES.filter((p) => p.categoria === cat);
  const k = current?.scheda;

  const picker = (
    <>
      <div className={controls.chips} role="tablist" aria-label="Categorie">
        {(Object.keys(CATEGORIE) as Categoria[]).map((c) => (
          <button key={c} className={c === cat ? controls.chipOn : ''} onClick={() => setCat(c)}>
            {CATEGORIE[c]}
          </button>
        ))}
      </div>
      <div className={styles.cases}>
        {list.map((p) => (
          <button
            key={p.id}
            className={p.id === caseId ? styles.caseOn : ''}
            onClick={() => loadCase(p.id)}
            aria-pressed={p.id === caseId}
          >
            {p.nome}
          </button>
        ))}
        <button className={caseId === null ? styles.caseOn : ''} onClick={() => loadCase(null)}>
          Cuore normale
        </button>
      </div>
    </>
  );

  return (
    <div className={controls.panel}>
      {!current && picker}
      {current && k && (
        <>
          <div className={styles.severity}>
            <div className={styles.caseTitle}>{current.nome}</div>
            <label htmlFor="gravita">
              <span>Gravità</span>
              <output>{current.gravita(severity)}</output>
            </label>
            <input
              id="gravita"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={severity}
              onChange={(e) => setSeverity(Number(e.target.value))}
            />
            <div className={styles.scale}>
              <span>lieve</span>
              <span>moderata</span>
              <span>grave</span>
            </div>
          </div>

          <AlertList />

          <Segmented
            label="Confronto con il cuore normale"
            value={compare ? 'on' : 'off'}
            options={[
              ['off', 'Solo paziente'],
              ['on', 'Affiancato'],
            ]}
            onChange={(v) => setCompare(v === 'on')}
          />
          {compare && <CompareTable />}

          <h3>Fisiopatologia</h3>
          <p className={styles.text}>{k.fisiopatologia}</p>

          <h3>Emodinamica attesa</h3>
          <ul className={styles.list}>
            {k.emodinamica.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>

          <h3>Ecocardiografia</h3>
          <ul className={styles.list}>
            {k.eco.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>

          <h3>Obiettivi anestesiologici</h3>
          <div className={styles.goals}>
            {GOALS.map(([id, label]) => (
              <Goal key={id} label={label} g={k.obiettivi[id]} />
            ))}
          </div>

          <div className={styles.key}>
            <strong>Messaggio chiave</strong>
            <p>{k.chiave}</p>
          </div>

          {k.prova && (
            <>
              <h3>Prova nel simulatore</h3>
              <ol className={styles.list}>
                {k.prova.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ol>
            </>
          )}
        </>
      )}
      {current && (
        <>
          <h3>Cambia caso</h3>
          {picker}
        </>
      )}
      {!current && (
        <p className={controls.hint}>
          Scegli una patologia: il caso riparte con i parametri corrispondenti alla gravità selezionata. Lo
          slider di gravità modifica i parametri in modo continuo e graduale, come un’evoluzione clinica.
        </p>
      )}
    </div>
  );
}
