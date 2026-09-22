import { resistanceFromDyn, resistanceToDyn } from '@physiology/units';
import { useSimulation } from '@store/simulation';
import styles from './Controls.module.css';
import { Segmented, Slider } from './Slider';

/** Controlli dei determinanti emodinamici: FC, precarico, postcarico, contrattilità, compliance, ventilazione. */
export function ControlPanel() {
  const p = useSimulation((s) => s.params);
  const set = useSimulation((s) => s.setParams);

  return (
    <div className={styles.panel}>
      <h3>Ritmo e frequenza</h3>
      <Segmented
        label="Ritmo"
        value={p.rhythm.rhythm}
        options={[
          ['sinus', 'Sinusale'],
          ['af', 'FA'],
          ['avb3', 'BAV III'],
        ]}
        onChange={(v) => set({ rhythm: { rhythm: v } })}
      />
      <Slider
        label={p.rhythm.rhythm === 'avb3' ? 'Frequenza atriale' : 'Frequenza cardiaca'}
        unit="bpm"
        value={p.rhythm.hr}
        min={30}
        max={180}
        step={1}
        onChange={(v) => set({ rhythm: { hr: v } })}
      />

      <h3>Precarico</h3>
      <Slider
        label="Volemia totale"
        unit="mL"
        value={p.bloodVolume}
        min={3000}
        max={7000}
        step={50}
        onChange={(v) => set({ bloodVolume: v })}
      />

      <h3>Postcarico</h3>
      <Slider
        label="Resistenze sistemiche (R)"
        unit="dyn·s·cm⁻⁵"
        value={resistanceToDyn(p.systemic.r)}
        min={400}
        max={3000}
        step={10}
        onChange={(v) => set({ systemic: { r: resistanceFromDyn(v) } })}
      />
      <Slider
        label="Resistenze polmonari (R)"
        unit="dyn·s·cm⁻⁵"
        value={resistanceToDyn(p.pulmonary.r)}
        min={30}
        max={800}
        step={5}
        onChange={(v) => set({ pulmonary: { r: resistanceFromDyn(v) } })}
      />
      <Slider
        label="Compliance arteriosa"
        unit="mL/mmHg"
        digits={2}
        value={p.systemic.ca}
        min={0.5}
        max={2.5}
        step={0.05}
        onChange={(v) => set({ systemic: { ca: v } })}
      />

      <h3>Contrattilità e rigidità</h3>
      <Slider
        label="Ees ventricolo sinistro"
        unit="mmHg/mL"
        digits={2}
        value={p.lv.ees}
        min={0.5}
        max={6}
        step={0.05}
        onChange={(v) => set({ lv: { ees: v } })}
      />
      <Slider
        label="Ees ventricolo destro"
        unit="mmHg/mL"
        digits={2}
        value={p.rv.ees}
        min={0.15}
        max={1.5}
        step={0.01}
        onChange={(v) => set({ rv: { ees: v } })}
      />
      <Slider
        label="Rigidità diastolica VS (λ)"
        unit="1/mL"
        digits={3}
        value={p.lv.lambda}
        min={0.02}
        max={0.08}
        step={0.001}
        onChange={(v) => set({ lv: { lambda: v } })}
      />

      <h3>Ventilazione</h3>
      <Segmented
        label="Modalità"
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
            label="Volume corrente"
            unit="mL"
            value={p.ventilation.tidalVolume}
            min={200}
            max={900}
            step={10}
            onChange={(v) => set({ ventilation: { tidalVolume: v } })}
          />
          <Slider
            label="PEEP"
            unit="cmH₂O"
            value={p.ventilation.peep}
            min={0}
            max={20}
            step={1}
            onChange={(v) => set({ ventilation: { peep: v } })}
          />
        </>
      )}
      {p.ventilation.mode === 'spontaneous' && (
        <Slider
          label="Sforzo inspiratorio"
          unit="mmHg"
          digits={1}
          value={p.ventilation.spontaneousSwing}
          min={1}
          max={15}
          step={0.5}
          onChange={(v) => set({ ventilation: { spontaneousSwing: v } })}
        />
      )}
      <Slider
        label="Frequenza respiratoria"
        unit="atti/min"
        value={p.ventilation.rr}
        min={6}
        max={35}
        step={1}
        onChange={(v) => set({ ventilation: { rr: v } })}
      />

      <h3>Pericardio</h3>
      <Slider
        label="Versamento pericardico"
        unit="mL"
        value={p.pericardium.effusion}
        min={0}
        max={450}
        step={5}
        onChange={(v) => set({ pericardium: { effusion: v } })}
      />
    </div>
  );
}
