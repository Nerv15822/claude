import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useState } from 'react';
import { BufferAttribute, BufferGeometry, Sphere, Vector3 } from 'three';
import { F } from '@physiology/engine';
import { sampleBuffer } from '@store/sampleBuffer';
import { useSimulation } from '@store/simulation';
import type { HeartBuffers } from './heartGeometry';
import { computeDeform, createDeformState } from './deformation';
import { applyDeform, createHeartMaterial } from './heartMaterial';

interface Props {
  /** Lato della cella della griglia (cm): qualità della mesh */
  cell: number;
  onReady?: () => void;
}

/** Cuore procedurale: geometria generata nel worker, deformata ogni frame dallo stato del motore. */
export function HeartMesh({ cell, onReady }: Props) {
  const [geometry, setGeometry] = useState<BufferGeometry | null>(null);
  const { material, uniforms } = useMemo(() => createHeartMaterial(), []);
  const deform = useMemo(() => createDeformState(), []);

  useEffect(() => {
    const worker = new Worker(new URL('../../workers/geometry.worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = (ev: MessageEvent<HeartBuffers>) => {
      const b = ev.data;
      const g = new BufferGeometry();
      g.setAttribute('position', new BufferAttribute(b.position, 3));
      g.setAttribute('normal', new BufferAttribute(b.normal, 3));
      g.setAttribute('color', new BufferAttribute(b.color, 3));
      g.setAttribute('aChamber', new BufferAttribute(b.aChamber, 4));
      g.setAttribute('aVessel', new BufferAttribute(b.aVessel, 4));
      g.setAttribute('aAxis', new BufferAttribute(b.aAxis, 3));
      g.setIndex(new BufferAttribute(b.index, 1));
      // Il bounding volume deve includere la deformazione massima
      g.boundingSphere = new Sphere(new Vector3(0.5, 3.5, -0.8), 16);
      setGeometry((old) => {
        old?.dispose();
        return g;
      });
      worker.terminate();
      onReady?.();
    };
    worker.postMessage({ cell });
    return () => worker.terminate();
  }, [cell, onReady]);

  useEffect(() => () => material.dispose(), [material]);

  useFrame(() => {
    if (sampleBuffer.head === 0) return;
    computeDeform(
      deform,
      sampleBuffer.latest(F.vLV),
      sampleBuffer.latest(F.vRV),
      sampleBuffer.latest(F.vLA),
      sampleBuffer.latest(F.vRA),
      sampleBuffer.latest(F.pAo),
      sampleBuffer.latest(F.pPA),
      sampleBuffer.latest(F.eV),
      undefined,
      sampleBuffer.latest(F.vSpt),
      useSimulation.getState().morphology,
    );
    applyDeform(uniforms, deform);
  });

  if (!geometry) return null;
  return <mesh geometry={geometry} material={material} frustumCulled={false} />;
}
