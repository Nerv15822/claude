import { useId } from 'react';
import styles from './Controls.module.css';

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  digits?: number;
  onChange: (v: number) => void;
}

export function Slider({ label, value, min, max, step, unit = '', digits = 0, onChange }: SliderProps) {
  const id = useId();
  return (
    <div className={styles.slider}>
      <label htmlFor={id}>
        <span>{label}</span>
        <output>
          {value.toFixed(digits)} <small>{unit}</small>
        </output>
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

interface SegmentedProps<T extends string> {
  label: string;
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (v: T) => void;
}

export function Segmented<T extends string>({ label, value, options, onChange }: SegmentedProps<T>) {
  return (
    <div className={styles.segmentedWrap}>
      <span className={styles.segLabel}>{label}</span>
      <div className={styles.segmented} role="radiogroup" aria-label={label}>
        {options.map(([v, text]) => (
          <button
            key={v}
            role="radio"
            aria-checked={v === value}
            className={v === value ? styles.active : ''}
            onClick={() => onChange(v)}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}
