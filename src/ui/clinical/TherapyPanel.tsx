import { DRUG_KEYS, DRUGS, type InfusionDrug } from '@physiology/drugs';
import { useSimulation } from '@store/simulation';
import controls from '../controls/Controls.module.css';
import { Segmented, Slider } from '../controls/Slider';
import { AlertList } from './AlertList';
import styles from './Clinical.module.css';

const pct = (x: number) => `${Math.round(Math.min(Math.max(x, 0), 1) * 100)}%`;

function Infusion({ k }: { k: InfusionDrug }) {
  const d = DRUGS[k];
  const dose = useSimulation((s) => s.params.drugs[k]);
  const ce = useSimulation((s) => s.status?.ce[k] ?? 0);
  const set = useSimulation((s) => s.setParams);
  const digits = d.step < 0.01 ? 3 : d.step < 0.1 ? 2 : d.step < 1 ? 1 : 0;
  const active = dose > 0 || ce > d.max * 0.005;
  return (
    <div className={`${styles.drug} ${active ? styles.drugOn : ''}`}>
      <Slider
        label={d.nome}
        unit={d.unita}
        digits={digits}
        value={dose}
        min={0}
        max={d.max}
        step={d.step}
        onChange={(v) => set({ drugs: { [k]: v } })}
      />
      {active && (
        <div className={styles.onset} title="Concentrazione al sito effettore">
          <div className={styles.onsetBar}>
            <span style={{ width: pct(ce / d.max) }} />
            <i style={{ left: pct(dose / d.max) }} />
          </div>
          <small>
            effettore {ce.toFixed(digits)} · t½ comparsa ~{Math.round(d.tau * 0.69)} s
          </small>
        </div>
      )}
      <p className={styles.mech}>{d.meccanismo}</p>
    </div>
  );
}

function ReflexGauge({ label, value }: { label: string; value: number }) {
  const dev = value - 1;
  return (
    <div className={styles.gauge}>
      <span>{label}</span>
      <div className={styles.gaugeBar}>
        <i
          style={{
            left: dev >= 0 ? '50%' : `${50 + Math.max(dev, -0.5) * 100}%`,
            width: `${Math.min(Math.abs(dev), 0.5) * 100}%`,
          }}
          className={dev >= 0 ? styles.up : styles.down}
        />
      </div>
      <output>×{value.toFixed(2)}</output>
    </div>
  );
}

/** Terapia: infusioni con comparsa graduale dell'effetto, boli, procedure e stato dei riflessi. */
export function TherapyPanel() {
  const p = useSimulation((s) => s.params);
  const status = useSimulation((s) => s.status);
  const set = useSimulation((s) => s.setParams);
  const fluid = useSimulation((s) => s.fluidBolus);
  const propofol = useSimulation((s) => s.propofol);
  const pending = status?.pendingVolume ?? 0;
  const effusion = status?.effusion ?? p.pericardium.effusion;
  const anyDrug = DRUG_KEYS.some((k) => p.drugs[k] > 0);

  return (
    <div className={controls.panel}>
      <AlertList />

      <h3>Liquidi</h3>
      <div className={styles.actions}>
        <button onClick={() => fluid(250, 60)}>Bolo 250 mL</button>
        <button onClick={() => fluid(500, 120)}>Bolo 500 mL</button>
        <button onClick={() => fluid(-500, 120)} className={styles.danger}>
          Emorragia 500 mL
        </button>
      </div>
      <p className={controls.hint}>
        Volemia target {p.bloodVolume.toFixed(0)} mL
        {Math.abs(pending) > 5 && ` · in corso ${pending > 0 ? '+' : ''}${pending.toFixed(0)} mL`} (boli
        accelerati: 250 mL/min).
      </p>

      <h3>Induzione</h3>
      <div className={styles.actions}>
        <button onClick={() => propofol(1)}>Propofol 1 mg/kg</button>
        <button onClick={() => propofol(2)}>Propofol 2 mg/kg</button>
      </div>
      {status && status.propofol > 0.05 && (
        <div className={styles.onset}>
          <div className={styles.onsetBar}>
            <span style={{ width: pct(status.propofol / 3) }} />
          </div>
          <small>Propofol al sito effettore {status.propofol.toFixed(2)} mg/kg eq. (picco ~1.5–2 min)</small>
        </div>
      )}
      <p className={controls.hint}>
        Vasodilatazione arteriosa e venosa, lieve inotropismo negativo e soprattutto attenuazione del
        baroriflesso: il paziente perde la compensazione simpatica.
      </p>

      <h3>Infusioni</h3>
      {DRUG_KEYS.map((k) => (
        <Infusion key={k} k={k} />
      ))}
      {anyDrug && (
        <div className={styles.actions}>
          <button
            onClick={() => set({ drugs: Object.fromEntries(DRUG_KEYS.map((k) => [k, 0])) })}
            className={styles.danger}
          >
            Sospendi tutte le infusioni
          </button>
        </div>
      )}

      <h3>Procedure</h3>
      <div className={styles.actions}>
        <button disabled={p.pericardium.effusion <= 0} onClick={() => set({ pericardium: { effusion: 0 } })}>
          Pericardiocentesi
        </button>
        <button
          className={p.iabp.enabled ? styles.actionOn : ''}
          onClick={() => set({ iabp: { enabled: !p.iabp.enabled } })}
          aria-pressed={p.iabp.enabled}
        >
          IABP 1:1 {p.iabp.enabled ? 'attivo' : 'spento'}
        </button>
      </div>
      {effusion > 1 && (
        <p className={controls.hint}>Versamento pericardico {effusion.toFixed(0)} mL (drenaggio graduale).</p>
      )}
      {p.iabp.enabled && (
        <p className={controls.hint}>
          Gonfiaggio a chiusura aortica (incisura dicrota), sgonfiaggio al QRS: aumento della pressione
          diastolica (perfusione coronarica) e riduzione della pressione telediastolica aortica (postcarico).
        </p>
      )}

      <Segmented
        label="Ventilazione"
        value={p.ventilation.mode}
        options={[
          ['spontaneous', 'Spontanea'],
          ['ppv', 'VPP'],
          ['apnea', 'Apnea'],
        ]}
        onChange={(v) => set({ ventilation: { mode: v } })}
      />
      {p.ventilation.mode === 'ppv' && (
        <>
          <Slider
            label="PEEP"
            unit="cmH₂O"
            value={p.ventilation.peep}
            min={0}
            max={20}
            step={1}
            onChange={(v) => set({ ventilation: { peep: v } })}
          />
          <Slider
            label="Volume corrente"
            unit="mL"
            value={p.ventilation.tidalVolume}
            min={200}
            max={900}
            step={10}
            onChange={(v) => set({ ventilation: { tidalVolume: v } })}
          />
        </>
      )}

      <h3>Baroriflesso</h3>
      <Segmented
        label=""
        value={p.reflex.enabled ? 'on' : 'off'}
        options={[
          ['on', 'Riflessi attivi'],
          ['off', 'Cuore isolato'],
        ]}
        onChange={(v) => set({ reflex: { enabled: v === 'on' } })}
      />
      {status && (
        <div className={styles.gauges}>
          <ReflexGauge label="Frequenza" value={status.reflex.hr} />
          <ReflexGauge label="Resistenze" value={status.reflex.resistance} />
          <ReflexGauge label="Capacità venosa" value={status.reflex.venous} />
          <ReflexGauge label="Contrattilità" value={status.reflex.contractility} />
        </div>
      )}
      <p className={controls.hint}>
        Il baroriflesso difende la PAM agendo su FC, resistenze, tono venoso e contrattilità con tempi diversi
        (secondi → decine di secondi). Anestetici e β-bloccanti ne riducono il guadagno.
      </p>
    </div>
  );
}
