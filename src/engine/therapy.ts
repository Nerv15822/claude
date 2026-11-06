/**
 * Emodinamica — modulatore clinico: compone i parametri EFFETTIVI del motore come
 *   effettivi = base × farmaci × baroriflesso × modulatori di stato
 * a ogni passo. È un `Modulator` del CardioEngine: legge engine.params (base) e scrive
 * engine.effParams e il tono dei distretti (engine.context.districtTone).
 *
 * Modulatori di stato (spec §3): baroriflesso con preset, pH (iporesponsività adrenergica
 * sotto 7.20), downregulation β tempo-dipendente (sepsi), volemia (nei params base),
 * K⁺/Mg²⁺ e temperatura (per aritmie e consumo di O₂, usati in Fase 3).
 */
import type { CardioEngine, Modulator } from './engine';
import { A } from './model';
import { assignParams } from './params';
import { type DrugEffects, type DrugId, PharmacoState } from './pharmacology';
import { Baroreflex, type ReflexPreset } from './reflex';
import { clamp, smoothstep } from './units';

export interface MetabolicState {
  /** pH arterioso. */
  ph: number;
  /** Temperatura centrale (°C). */
  temperature: number;
  /** Potassio (mmol/L). */
  potassium: number;
  /** Magnesio (mmol/L). */
  magnesium: number;
  /** Downregulation dei recettori β (0…1), tempo-dipendente nello shock settico. */
  betaDownreg: number;
  /** Tono di NO endogeno aggiuntivo (vasoplegia settica), 0…~0.6. */
  extraNO: number;
}

export function defaultMetabolic(): MetabolicState {
  return { ph: 7.4, temperature: 37, potassium: 4.2, magnesium: 0.9, betaDownreg: 0, extraNO: 0 };
}

export class ClinicalModulator implements Modulator {
  pharmaco = new PharmacoState();
  reflex: Baroreflex;
  metabolic: MetabolicState = defaultMetabolic();
  reflexEnabled = true;
  reflexPreset: ReflexPreset = 'awake';
  reflexSetpoint = 95;

  /** Ultimo calcolo (per effetti collaterali / trasporto di O₂ / UI). */
  lastEffects: DrugEffects | null = null;
  lastResponsiveness = 1;

  constructor(setpoint = 95) {
    this.reflexSetpoint = setpoint;
    this.reflex = new Baroreflex(setpoint);
  }

  setDose(id: DrugId, dose: number): void {
    this.pharmaco.setDose(id, dose);
  }

  setReflex(preset: ReflexPreset, enabled = true): void {
    this.reflexPreset = preset;
    this.reflexEnabled = enabled;
  }

  /** Responsività adrenergica dall'ambiente metabolico + ripristino permissivo (idrocortisone). */
  private responsiveness(): number {
    const m = this.metabolic;
    const respPh = 0.3 + 0.7 * smoothstep(6.8, 7.2, m.ph);
    const respTemp = clamp(1 + (m.temperature - 37) * 0.025, 0.6, 1.05);
    const respBeta = 1 - 0.5 * clamp(m.betaDownreg, 0, 1);
    let resp = respPh * respTemp * respBeta;
    const permissive = this.pharmaco.permissiveLevel();
    resp = resp + permissive * (1 - resp) * 0.85; // l'idrocortisone ripristina, senza superare 1
    return clamp(resp, 0.1, 1.05);
  }

  onStep(engine: CardioEngine, dt: number): void {
    this.pharmaco.step(dt);
    const resp = this.responsiveness();
    this.lastResponsiveness = resp;
    const eff = this.pharmaco.effects({ adrenergicResponsiveness: resp, extraNO: this.metabolic.extraNO });
    this.lastEffects = eff;

    // Baroriflesso sulla PAM corrente (aux dell'ultimo passo).
    const map = engine.aux[A.P_AO]!;
    this.reflex.update(
      dt,
      map,
      this.reflexSetpoint,
      this.reflexPreset,
      { responsiveness: resp, hrDrug: eff.reflexHRgain },
      this.reflexEnabled,
    );

    const base = engine.params;
    const e = engine.effParams;
    // Riparti da base a ogni passo (in place), poi applica i moltiplicatori.
    assignParams(e, base);
    const tempHr = clamp(1 + (this.metabolic.temperature - 37) * 0.05, 0.6, 1.5);

    // Frequenza.
    e.rhythm.hr = clamp(base.rhythm.hr * eff.hr * this.reflex.hrMult * tempHr, 25, 200);
    // Contrattilità e lusitropismo (entrambi i ventricoli).
    const ino = eff.inotropy * this.reflex.inoMult;
    e.lv.ees = base.lv.ees * ino;
    e.rv.ees = base.rv.ees * ino;
    e.lv.lambda = base.lv.lambda * eff.lusitropy;
    e.rv.lambda = base.rv.lambda * eff.lusitropy;
    // Tono venoso (volume unstressed): venocostrizione da farmaci × riflesso.
    e.systemic.vv0 = base.systemic.vv0 * eff.venousVv0 * this.reflex.venousVv0;
    // Circolo polmonare.
    e.pulmonary.r = base.pulmonary.r * eff.pulmR;

    // Tono dei distretti: conduttanza = farmaci × riflesso arteriolare.
    const tone = engine.context.districtTone;
    for (let i = 0; i < tone.length; i++) {
      tone[i] = eff.districtTone[i]! * this.reflex.arterialCond;
    }
  }
}
