import { useView, type ParticleColor, type SectionPlane, type ViewMode } from '@scene/viewStore';
import { useSimulation } from '@store/simulation';
import styles from './Controls.module.css';
import { Segmented, Slider } from './Slider';

const MODES: readonly (readonly [ViewMode, string])[] = [
  ['esterna', 'Esterna'],
  ['sezione', 'Sezione'],
  ['raggiX', 'Raggi X'],
  ['pressione', 'Pressioni'],
  ['attivazione', 'Attivazione'],
];

const DESCRIPTIONS: Record<ViewMode, string> = {
  esterna: 'Superficie epicardica con coronarie e grasso. Doppio tap su una struttura per il nome.',
  sezione:
    'Sezione anatomica con camere, valvole, muscoli papillari e flusso. Il taglio del miocardio è colorato in bruno.',
  raggiX: 'Epicardio ed endocardio trasparenti: si vedono valvole, papillari e flusso di sangue.',
  pressione: 'Endocardio colorato con la pressione istantanea di ciascuna camera (scala 0–140 mmHg).',
  attivazione: "Ventricoli e atri si illuminano con l'attivazione elettromeccanica (sincrona con l'ECG).",
};

/** Controlli della visualizzazione 3D: modalità, piani di sezione, particelle di flusso. */
export function ViewPanel() {
  const compare = useSimulation((s) => s.compare);
  const setCompare = useSimulation((s) => s.setCompare);
  const v = useView();
  return (
    <div className={styles.panel}>
      <h3>Modalità</h3>
      <div className={styles.chips}>
        {MODES.map(([id, label]) => (
          <button key={id} className={v.mode === id ? styles.chipOn : ''} onClick={() => v.setMode(id)}>
            {label}
          </button>
        ))}
      </div>
      <p className={styles.hint}>{DESCRIPTIONS[v.mode]}</p>

      <Segmented
        label="Confronto con il cuore normale"
        value={compare ? 'on' : 'off'}
        options={[
          ['off', 'Solo paziente'],
          ['on', 'Schermo diviso'],
        ]}
        onChange={(x) => setCompare(x === 'on')}
      />
      {compare && (
        <p className={styles.hint}>
          A sinistra un cuore normale simulato in parallelo, a destra il paziente: stessa vista, stessa
          modalità, stesso istante. Il post-processing è disattivato per mantenere la fluidità.
        </p>
      )}

      {v.mode === 'sezione' && (
        <>
          <h3>Piano di sezione</h3>
          <Segmented<SectionPlane>
            label=""
            value={v.section}
            options={[
              ['quattroCamere', '4 camere'],
              ['asseLungo', 'Asse lungo'],
              ['asseCorto', 'Asse corto'],
            ]}
            onChange={v.setSection}
          />
          <Slider
            label="Posizione del piano"
            value={v.sectionOffset}
            min={-1}
            max={1}
            step={0.02}
            digits={2}
            onChange={v.setSectionOffset}
          />
        </>
      )}

      {v.mode !== 'esterna' && v.mode !== 'attivazione' && (
        <>
          <h3>Flusso</h3>
          <Segmented<'on' | 'off'>
            label="Particelle"
            value={v.particles ? 'on' : 'off'}
            options={[
              ['on', 'Visibili'],
              ['off', 'Nascoste'],
            ]}
            onChange={(x) => v.setParticles(x === 'on')}
          />
          <Segmented<ParticleColor>
            label="Colore"
            value={v.particleColor}
            options={[
              ['saturazione', 'Saturazione O₂'],
              ['doppler', 'Color-Doppler'],
            ]}
            onChange={v.setParticleColor}
          />
          <p className={styles.hint}>
            {v.particleColor === 'doppler'
              ? 'Rosso/giallo verso l’osservatore, blu/azzurro in allontanamento; aliasing oltre 70 cm/s, mosaico verde nei flussi turbolenti.'
              : 'Rosso: sangue ossigenato (SaO₂). Blu: sangue venoso, tonalità in base alla SvO₂ calcolata.'}{' '}
            Velocità delle particelle = flusso del modello / area del lume.
          </p>
        </>
      )}
    </div>
  );
}
