import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo } from 'react';
import { Box3, Mesh, Vector3, type Object3D } from 'three';
import { F } from '@physiology/engine';
import { sampleBuffer } from '@store/sampleBuffer';
import { computeDeform, createDeformState, type DeformState } from './deformation';
import { classifyMesh, GLB_URL, type Part } from './glbNaming';

function scaleFor(part: Part, d: DeformState): number {
  switch (part) {
    case 'lv':
      return Math.cbrt(d.lvRad * d.lvRad * d.lvAx);
    case 'rv':
      return Math.cbrt(d.rvRad * d.rvRad * d.rvAx);
    case 'la':
      return d.la;
    case 'ra':
      return d.ra;
    case 'aorta':
      return d.ao;
    case 'pa':
      return d.pa;
    default:
      return 1;
  }
}

/**
 * Modello anatomico GLB esterno. Ogni mesh riconosciuta viene scalata attorno al proprio baricentro
 * secondo il volume della camera corrispondente (deformazione più grossolana di quella procedurale,
 * che usa pesi per vertice). Il modello viene normalizzato a ~22 cm di altezza.
 */
export function GlbHeart() {
  const { scene } = useGLTF(GLB_URL);
  const deform = useMemo(() => createDeformState(), []);
  const parts = useMemo(() => {
    const root: Object3D = scene.clone(true);
    const box = new Box3().setFromObject(root);
    const size = box.getSize(new Vector3());
    const k = 22 / Math.max(size.y, 1e-6);
    root.scale.setScalar(k);
    const c = box.getCenter(new Vector3()).multiplyScalar(k);
    root.position.set(0.6 - c.x, 2.4 - c.y, -0.6 - c.z);
    const list: { mesh: Mesh; part: Part }[] = [];
    root.traverse((o) => {
      if (!(o instanceof Mesh)) return;
      const part = classifyMesh(o.name);
      if (part === 'other') return;
      o.geometry = o.geometry.clone();
      o.geometry.computeBoundingBox();
      const center = o.geometry.boundingBox!.getCenter(new Vector3());
      o.geometry.translate(-center.x, -center.y, -center.z);
      o.position.add(center);
      list.push({ mesh: o, part });
    });
    return { root, list };
  }, [scene]);

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
    );
    for (const { mesh, part } of parts.list) mesh.scale.setScalar(scaleFor(part, deform));
  });

  return <primitive object={parts.root} />;
}
