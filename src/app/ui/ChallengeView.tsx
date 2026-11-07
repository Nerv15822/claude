import { useState } from 'react';

interface Option {
  label: string;
  correct: boolean;
  feedback: string;
}
interface Challenge {
  titolo: string;
  vitals: [string, string][];
  prompt: string;
  options: Option[];
  messaggio: string;
}

const CHALLENGES: Challenge[] = [
  {
    titolo: 'Caso 1',
    vitals: [
      ['MAP', '62 mmHg'],
      ['CO', '6.4 L/min'],
      ['FC', '118 bpm'],
      ['SVR', '540 dyn·s·cm⁻⁵'],
      ['SvO₂', '74 %'],
      ['Lattato', '2.8 mmol/L'],
    ],
    prompt: 'Shock caldo: gittata alta, resistenze crollate, dopo riempimento adeguato. Prima scelta?',
    options: [
      {
        label: 'Noradrenalina',
        correct: true,
        feedback:
          'Corretto: ripristina le SVR (α1) mantenendo la gittata. È il vasopressore di prima linea nello shock distributivo.',
      },
      {
        label: 'Dobutamina',
        correct: false,
        feedback: 'No: la gittata è già alta; un inodilatatore peggiora la vasoplegia e l’ipotensione.',
      },
      {
        label: 'Nitroglicerina',
        correct: false,
        feedback: 'Pericoloso: vasodilata ulteriormente un paziente già ipoteso.',
      },
      {
        label: 'Esmololo',
        correct: false,
        feedback: 'No: ridurre FC e contrattilità aggrava l’ipotensione.',
      },
    ],
    messaggio:
      'Shock distributivo → il problema sono le RESISTENZE: vasopressore (noradrenalina), non inotropo.',
  },
  {
    titolo: 'Caso 2',
    vitals: [
      ['MAP', '74 mmHg'],
      ['CO', '2.8 L/min'],
      ['FC', '104 bpm'],
      ['PAOP', '24 mmHg'],
      ['SVR', '1850 dyn·s·cm⁻⁵'],
      ['SvO₂', '48 %'],
    ],
    prompt: 'Gittata bassa, pressioni di riempimento alte, resistenze alte, SvO₂ bassa. Prima scelta?',
    options: [
      {
        label: 'Dobutamina',
        correct: true,
        feedback:
          'Corretto: inotropo che aumenta la gittata e, riducendo le resistenze, scarica il VS. SvO₂ in risalita.',
      },
      {
        label: 'Fenilefrina',
        correct: false,
        feedback: 'No: aumenta il postcarico di un VS che già non eietta — la gittata cala ancora.',
      },
      {
        label: 'Bolo di liquidi',
        correct: false,
        feedback: 'No: PAOP 24 mmHg indica congestione; altro volume peggiora l’edema polmonare.',
      },
      {
        label: 'Noradrenalina',
        correct: false,
        feedback:
          'Da sola aumenta il postcarico; utile solo per garantire la perfusione coronarica se MAP troppo bassa.',
      },
    ],
    messaggio:
      'Shock cardiogeno → il problema è la POMPA: inotropo (± riduzione del postcarico), evitare sovraccarico di volume.',
  },
  {
    titolo: 'Caso 3',
    vitals: [
      ['MAP', '76 mmHg'],
      ['CO', '3.4 L/min'],
      ['FC', '126 bpm'],
      ['PVC', '−1 mmHg'],
      ['SVR', '1700 dyn·s·cm⁻⁵'],
      ['PPV', '18 %'],
    ],
    prompt: 'Tachicardia, precarico bassissimo, PPV alta dopo trauma. Priorità?',
    options: [
      {
        label: 'Riempimento (sangue/cristalloidi)',
        correct: true,
        feedback:
          'Corretto: PPV alta e PVC bassa = responsività al volume. La priorità è il VOLUME (e il controllo dell’emorragia).',
      },
      {
        label: 'Noradrenalina ad alte dosi',
        correct: false,
        feedback:
          'No: il vasopressore maschera l’ipovolemia senza correggerla; rischio di ipoperfusione d’organo.',
      },
      {
        label: 'Nitroglicerina',
        correct: false,
        feedback: 'Catastrofico: riduce ulteriormente un precarico già critico → crollo della gittata.',
      },
      {
        label: 'Esmololo per la tachicardia',
        correct: false,
        feedback: 'No: la tachicardia è compensatoria; β-bloccarla toglie l’unico compenso.',
      },
    ],
    messaggio:
      'Ipovolemia → il problema è il PRECARICO: riempire. I vasopressori non sostituiscono il volume.',
  },
  {
    titolo: 'Caso 4',
    vitals: [
      ['MAP', '54 mmHg'],
      ['CO', '4.2 L/min'],
      ['FC', '132 bpm'],
      ['SVR', '600 dyn·s·cm⁻⁵'],
      ['SpO₂', '90 %'],
    ],
    prompt: 'Vasoplegia improvvisa con broncospasmo e orticaria dopo un farmaco. Prima scelta?',
    options: [
      {
        label: 'Adrenalina',
        correct: true,
        feedback:
          'Corretto: prima linea nell’anafilassi — α1 (vasocostrizione), β2 (broncodilatazione), β1 (inotropia).',
      },
      {
        label: 'Fenilefrina',
        correct: false,
        feedback:
          'No: α1 puro, nessuna broncodilatazione né supporto β; non è il trattamento dell’anafilassi.',
      },
      {
        label: 'Idrocortisone da solo',
        correct: false,
        feedback:
          'Utile come adiuvante (effetto permissivo), ma non salva la vita nell’immediato: serve prima l’adrenalina.',
      },
      {
        label: 'Vasopressina',
        correct: false,
        feedback: 'Opzione nelle forme refrattarie all’adrenalina, non di prima battuta.',
      },
    ],
    messaggio: 'Anafilassi → ADRENALINA subito: copre vasoplegia, broncospasmo e inotropia insieme.',
  },
  {
    titolo: 'Caso 5',
    vitals: [
      ['MAP', '82 mmHg'],
      ['CO', '3.6 L/min'],
      ['PAPm', '42 mmHg'],
      ['PVR', '520 dyn·s·cm⁻⁵'],
      ['PVC', '14 mmHg'],
      ['PAOP', '6 mmHg'],
    ],
    prompt: 'VD dilatato e iperteso, PVC alta ma PAOP bassa (VS sottoriempito per shift settale). Approccio?',
    options: [
      {
        label: 'Noradrenalina + ridurre la PVR',
        correct: true,
        feedback:
          'Corretto: sostenere la perfusione del VD (MAP) e ridurre il postcarico polmonare; evitare l’ipotensione sistemica.',
      },
      {
        label: 'Carico di liquidi generoso',
        correct: false,
        feedback: 'No: distende ulteriormente il VD, peggiora lo shift settale e il riempimento del VS.',
      },
      {
        label: 'Nitroglicerina',
        correct: false,
        feedback: 'No: il VD è preload-dipendente; la venodilatazione fa crollare la gittata.',
      },
      { label: 'Esmololo', correct: false, feedback: 'No: deprime un VD già in difficoltà.' },
    ],
    messaggio:
      'Scompenso destro → sostenere il VD (perfusione) e ridurre la PVR; attenzione a volume e venodilatatori.',
  },
];

export function ChallengeView() {
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const ch = CHALLENGES[idx]!;
  const answered = picked !== null;
  return (
    <>
      <div className="em-card">
        <h2>
          Sfida · {ch.titolo} ({idx + 1}/{CHALLENGES.length})
        </h2>
        <div className="em-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          {ch.vitals.map(([k, v]) => (
            <div className="em-tile" key={k}>
              <div className="k">{k}</div>
              <div className="v" style={{ fontSize: 16 }}>
                {v}
              </div>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 14, marginTop: 10 }}>{ch.prompt}</p>
      </div>

      <div className="em-card">
        <h2>Scegli il trattamento</h2>
        {ch.options.map((o, i) => {
          const show = answered;
          return (
            <button
              key={i}
              className="em-btn"
              style={{
                width: '100%',
                justifyContent: 'flex-start',
                marginBottom: 8,
                textAlign: 'left',
                borderColor: show && o.correct ? '#2f9e44' : show && i === picked ? '#e03131' : 'var(--line)',
                background:
                  show && o.correct
                    ? '#eafaef'
                    : show && i === picked && !o.correct
                      ? '#fdecec'
                      : 'var(--card-2)',
              }}
              onClick={() => !answered && setPicked(i)}
            >
              <span style={{ fontWeight: 600 }}>
                {show ? (o.correct ? '✓ ' : i === picked ? '✗ ' : '') : ''}
                {o.label}
              </span>
            </button>
          );
        })}
        {answered ? (
          <>
            <p className="em-note" style={{ fontSize: 13, color: 'var(--ink)' }}>
              {ch.options[picked!]!.feedback}
            </p>
            <div className="em-alert" style={{ borderLeftColor: 'var(--accent)' }}>
              <div className="m">
                <b>Messaggio chiave.</b> {ch.messaggio}
              </div>
            </div>
            <button
              className="em-btn primary"
              style={{ width: '100%', marginTop: 8 }}
              onClick={() => {
                setPicked(null);
                setIdx((idx + 1) % CHALLENGES.length);
              }}
            >
              Prossimo caso →
            </button>
          </>
        ) : null}
      </div>
    </>
  );
}
