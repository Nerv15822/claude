import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useState } from 'react';
import { F } from '@physiology/engine';
import { sampleBuffer } from '@store/sampleBuffer';
import { loadAnatomy, type AnatomyAsset } from './anatomicalAsset';
import { computeDeform, createDeformState } from './deformation';
import { applyDeform, createHeartMaterial } from './heartMaterial';

interface Props {
  onReady?: () => void;
  onError?: () => void;
}

/** Cuore anatomico reale (BodyParts3D), deformato ogni frame dallo stato del motore. */
export function AnatomicalHeart({ onReady, onError }: Props) {
  const [asset, setAsset] = useState<AnatomyAsset | null>(null);
  const deform = useMemo(() => createDeformState(), []);

  useEffect(() => {
    let alive = true;
    loadAnatomy()
      .then((a) => {
        if (!alive) return;
        setAsset(a);
        onReady?.();
      })
      .catch(() => alive && onError?.());
    return () => {
      alive = false;
    };
  }, [onReady, onError]);

  const mat = useMemo(() => (asset ? createHeartMaterial(asset.meta) : null), [asset]);
  useEffect(() => () => mat?.material.dispose(), [mat]);
  useEffect(() => () => asset?.geometry.dispose(), [asset]);

  useFrame(() => {
    if (!asset || !mat || sampleBuffer.head === 0) return;
    computeDeform(
      deform,
      sampleBuffer.latest(F.vLV),
      sampleBuffer.latest(F.vRV),
      sampleBuffer.latest(F.vLA),
      sampleBuffer.latest(F.vRA),
      sampleBuffer.latest(F.pAo),
      sampleBuffer.latest(F.pPA),
      sampleBuffer.latest(F.eV),
      asset.meta.refVolume,
    );
    applyDeform(mat.uniforms, deform);
  });

  if (!asset || !mat) return null;
  return <mesh geometry={asset.geometry} material={mat.material} frustumCulled={false} />;
}
