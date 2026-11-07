import { DRUGS, DRUG_IDS, type DrugId, REFLEX_PRESETS, type ReflexPreset } from '../../engine';
import { SCENARIOS } from '../scenarios';
import { useStore } from '../store';
import { doseToSlider, fmt, sliderToDose } from './format';

function DrugSlider({ id, onClear }: { id: DrugId; onClear?: () => void }) {
  const dose = useStore((s) => s.doses[id]);
  const setDose = useStore((s) => s.setDose);
  const spec = DRUGS[id];
  return (
    <div className="em-field" style={{ flexBasis: '100%' }}>
      <label>
        <span>
          {spec.nome} · <b className="val">{dose < 1 ? dose.toFixed(3) : fmt(dose, 2)}</b> {spec.unita}
        </span>
        {onClear ? (
          <button
            className="em-btn ghost"
            style={{ minHeight: 20, padding: '0 6px', fontSize: 12 }}
            onClick={onClear}
          >
            rimuovi
          </button>
        ) : null}
      </label>
      <input
        type="range"
        min={0}
        max={1}
        step={0.001}
        value={doseToSlider(dose, spec.max)}
        onChange={(e) => setDose(id, sliderToDose(Number(e.target.value), spec.max))}
      />
    </div>
  );
}

export function ControlBar() {
  const s = useStore();
  return (
    <div className="em-controls">
      <div className="em-row">
        <div className="em-field" style={{ flex: '1 1 100%' }}>
          <label>
            <span>Scenario</span>
          </label>
          <select value={s.scenarioId} onChange={(e) => s.setScenario(e.target.value)}>
            {SCENARIOS.map((sc) => (
              <option key={sc.id} value={sc.id}>
                {sc.nome}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="em-row">
        <div className="em-field">
          <label>
            <span>Farmaco</span>
          </label>
          <select value={s.drugA} onChange={(e) => s.setDrugA(e.target.value as DrugId)}>
            {DRUG_IDS.map((id) => (
              <option key={id} value={id}>
                {DRUGS[id].nome}
              </option>
            ))}
          </select>
        </div>
        <DrugSlider id={s.drugA} />
      </div>

      {s.drugB ? (
        <div className="em-row">
          <div className="em-field">
            <label>
              <span>2° farmaco</span>
            </label>
            <select value={s.drugB} onChange={(e) => s.setDrugB(e.target.value as DrugId)}>
              {DRUG_IDS.map((id) => (
                <option key={id} value={id}>
                  {DRUGS[id].nome}
                </option>
              ))}
            </select>
          </div>
          <DrugSlider
            id={s.drugB}
            onClear={() => {
              s.setDose(s.drugB!, 0);
              s.setDrugB(null);
            }}
          />
        </div>
      ) : (
        <button className="em-btn ghost" onClick={() => s.setDrugB('nitroglycerin')}>
          + secondo farmaco
        </button>
      )}

      <div className="em-row">
        <div className="em-field">
          <label>
            <span>Volemia</span>
            <b className="val">{fmt(s.bloodVolume)} mL</b>
          </label>
          <input
            type="range"
            min={2800}
            max={6200}
            step={50}
            value={s.bloodVolume}
            onChange={(e) => s.setBloodVolume(Number(e.target.value))}
          />
        </div>
        <div className="em-field">
          <label>
            <span>PEEP</span>
            <b className="val">{fmt(s.peep)} cmH₂O</b>
          </label>
          <input
            type="range"
            min={0}
            max={20}
            step={1}
            value={s.peep}
            onChange={(e) => s.setPeep(Number(e.target.value))}
          />
        </div>
      </div>

      <div className="em-row">
        <div className="em-field">
          <label>
            <span>pH</span>
            <b className="val">{s.ph.toFixed(2)}</b>
          </label>
          <input
            type="range"
            min={6.9}
            max={7.6}
            step={0.01}
            value={s.ph}
            onChange={(e) => s.setPh(Number(e.target.value))}
          />
        </div>
        <div className="em-field">
          <label>
            <span>Baroriflesso</span>
          </label>
          <select
            value={s.reflexPreset}
            onChange={(e) => s.setReflex(e.target.value as ReflexPreset, s.reflexEnabled)}
          >
            {(Object.keys(REFLEX_PRESETS) as ReflexPreset[]).map((p) => (
              <option key={p} value={p}>
                {REFLEX_PRESETS[p].nome}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="em-row">
        <button className="em-btn primary" style={{ flex: 1 }} onClick={() => s.setPaused(!s.paused)}>
          {s.paused ? '▶ Riprendi' : '⏸ Pausa'}
        </button>
        <div className="em-seg" role="group" aria-label="velocità">
          {[0.5, 1, 2].map((v) => (
            <button key={v} className={s.speed === v ? 'on' : ''} onClick={() => s.setSpeed(v)}>
              {v}×
            </button>
          ))}
        </div>
      </div>
      <p className="em-note">
        Ventilazione:{' '}
        <select
          value={s.ventMode}
          onChange={(e) => s.setVentMode(e.target.value as 'apnea' | 'spontaneous' | 'ppv')}
          style={{ minHeight: 32, fontSize: 13 }}
        >
          <option value="spontaneous">spontanea</option>
          <option value="ppv">pressione positiva</option>
          <option value="apnea">apnea</option>
        </select>
      </p>
    </div>
  );
}
