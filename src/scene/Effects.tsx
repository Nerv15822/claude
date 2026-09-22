import { Bloom, EffectComposer, N8AO, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import type { Quality } from './viewStore';

/**
 * Post-processing scalabile:
 * - alta: occlusione ambientale N8AO piena, bloom leggero, SMAA, vignettatura
 * - media: N8AO a mezza risoluzione, vignettatura
 * - bassa: nessun effetto (tone mapping del renderer)
 */
export function Effects({ quality }: { quality: Quality }) {
  if (quality === 'bassa') return null;
  const high = quality === 'alta';
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      <N8AO
        aoRadius={1.6}
        distanceFalloff={0.6}
        intensity={high ? 3.2 : 2.6}
        quality={high ? 'high' : 'performance'}
        halfRes={!high}
        color="#1a0503"
      />
      {high ? (
        <Bloom intensity={0.25} luminanceThreshold={0.85} luminanceSmoothing={0.2} mipmapBlur />
      ) : (
        <></>
      )}
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <Vignette offset={0.28} darkness={0.55} />
      {high ? <SMAA /> : <></>}
    </EffectComposer>
  );
}
