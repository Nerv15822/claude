import { describe, expect, it } from 'vitest';
import { emptyBeatMetrics } from '@physiology/metrics';
import { defaultParams } from '@physiology/params';
import { valutaAvvisi } from '@pathologies/alerts';

const beat = (patch: Partial<ReturnType<typeof emptyBeatMetrics>>) => ({
  ...emptyBeatMetrics(),
  aoMean: 90,
  hr: 75,
  evr: 1,
  laMean: 8,
  qpqs: 1,
  ...patch,
});

describe('avvisi didattici', () => {
  it('nessun avviso nel normale', () => {
    expect(valutaAvvisi(null, beat({}), defaultParams())).toEqual([]);
  });
  it('stenosi aortica: EVR basso, tachicardia, vasodilatazione', () => {
    const p = defaultParams();
    p.drugs.nitroglycerin = 1;
    const ids = valutaAvvisi('stenosi-aortica', beat({ evr: 0.4, hr: 110 }), p).map((a) => a.id);
    expect(ids).toEqual(expect.arrayContaining(['sa-evr', 'tachicardia-critica', 'sa-vasodilatazione']));
  });
  it('CMIO con inotropo: avviso critico in cima', () => {
    const p = defaultParams();
    p.drugs.dobutamine = 5;
    const a = valutaAvvisi('hocm', beat({ avPeakGradient: 80, aoMean: 55 }), p);
    expect(a[0]!.livello).toBe('critico');
    expect(a.map((x) => x.id)).toContain('hocm-inotropi');
  });
});
