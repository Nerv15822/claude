import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DoubleSide,
  Material,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NotEqualStencilFunc,
  Plane,
  Quaternion,
  ReplaceStencilOp,
  Vector3,
  type Mesh,
} from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import { F } from '@physiology/engine';
import { sampleBuffer } from '@store/sampleBuffer';
import { useSimulation } from '@store/simulation';
import { useView } from '../viewStore';
import { loadAnatomy, type AnatomyAsset } from './anatomicalAsset';
import { MAX_LEAFLETS } from './deformGlsl';
import { computeDeform, createDeformState } from './deformation';
import {
  applyDeform,
  createHeartUniforms,
  createStencilMaterials,
  createSurfaceMaterial,
  type HeartUniforms,
} from './heartMaterial';
import { FlowParticles } from './FlowParticles';
import { labelFor } from './labels';
import { sectionPlane } from './sectionPlanes';
import { ValveDynamics } from './valveDynamics';

interface Props {
  onReady?: () => void;
  onError?: () => void;
}

const GROUP_ORDER = ['exterior', 'cavities', 'papillary', 'valves'] as const;

/**
 * Cuore anatomico reale (BodyParts3D) guidato dal motore: deformazione, lembi valvolari, modalità
 * di visualizzazione (esterna, sezione con capping a stencil, raggi X, heatmap di pressione, attivazione).
 */
export function AnatomicalHeart({ onReady, onError }: Props) {
  const [asset, setAsset] = useState<AnatomyAsset | null>(null);
  const deform = useMemo(() => createDeformState(), []);
  const mode = useView((s) => s.mode);
  const section = useView((s) => s.section);
  const offset = useView((s) => s.sectionOffset);
  const setLabel = useView((s) => s.setLabel);
  const plane = useMemo(() => new Plane(new Vector3(0, 0, -1), 0), []);
  const capRef = useRef<Mesh>(null);

  useEffect(() => {
    let alive = true;
    loadAnatomy()
      .then((a) => {
        if (!alive) return;
        const g = a.geometry;
        g.clearGroups();
        GROUP_ORDER.forEach((name, i) => {
          const r = a.meta.groups[name];
          if (r) g.addGroup(r.start, r.count, i);
        });
        setAsset(a);
        onReady?.();
      })
      .catch(() => alive && onError?.());
    return () => {
      alive = false;
    };
  }, [onReady, onError]);

  const kit = useMemo(() => {
    if (!asset) return null;
    const uniforms: HeartUniforms = createHeartUniforms(asset.meta);
    const hidden = new MeshBasicMaterial({ visible: false });
    const ext = createSurfaceMaterial('exterior', uniforms);
    const extX = createSurfaceMaterial('exterior', uniforms, true);
    const endo = createSurfaceMaterial('endocardium', uniforms);
    const pap = createSurfaceMaterial('papillary', uniforms);
    const valve = createSurfaceMaterial('valve', uniforms);
    const [stBack, stFront] = createStencilMaterials(uniforms, plane);
    const [stBackHole, stFrontHole] = createStencilMaterials(uniforms, plane, true);
    const cap = new MeshStandardMaterial({
      // Superficie di taglio del miocardio (tessuto muscolare sezionato)
      color: '#7a1f18',
      emissive: '#2a0806',
      roughness: 0.7,
      side: DoubleSide,
      stencilWrite: true,
      stencilRef: 0,
      stencilFunc: NotEqualStencilFunc,
      stencilFail: ReplaceStencilOp,
      stencilZFail: ReplaceStencilOp,
      stencilZPass: ReplaceStencilOp,
    });
    const endoX = createSurfaceMaterial('endocardium', uniforms, true);
    return {
      uniforms,
      hidden,
      ext,
      extX,
      endo,
      endoX,
      pap,
      valve,
      stBack,
      stFront,
      stBackHole,
      stFrontHole,
      cap,
      valves: new ValveDynamics(),
    };
  }, [asset, plane]);

  useEffect(
    () => () => {
      if (!kit) return;
      for (const m of Object.values(kit)) if (m instanceof Material) m.dispose();
    },
    [kit],
  );
  useEffect(() => () => asset?.geometry.dispose(), [asset]);

  // Materiali e piani di taglio in base alla modalità
  const materials = useMemo(() => {
    if (!kit) return null;
    const clip = mode === 'sezione' ? [plane] : null;
    for (const m of [kit.ext, kit.endo, kit.pap, kit.valve]) {
      m.clippingPlanes = clip;
      m.needsUpdate = true;
    }
    kit.uniforms.uMode.value = mode === 'pressione' ? 1 : mode === 'attivazione' ? 2 : 0;
    kit.uniforms.uXray.value = mode === 'raggiX' || mode === 'pressione' ? 1 : 0;
    switch (mode) {
      case 'esterna':
      case 'attivazione':
        return [kit.ext, kit.hidden, kit.hidden, kit.hidden];
      case 'sezione':
        return [kit.ext, kit.endo, kit.pap, kit.valve];
      case 'raggiX':
        return [kit.extX, kit.endoX, kit.pap, kit.valve];
      case 'pressione':
        return [kit.extX, kit.endo, kit.pap, kit.valve];
    }
  }, [kit, mode, plane]);

  // Direzione di osservazione della sezione per la camera
  useEffect(() => {
    if (!asset) return;
    const pl = sectionPlane(asset.meta, section, 0, new Plane());
    const c = pl.coplanarPoint(new Vector3());
    useView.setState({
      sectionView: { dir: [-pl.normal.x, -pl.normal.y, -pl.normal.z], center: [c.x, c.y, c.z] },
    });
  }, [asset, section]);

  const frame = useRef({ lastT: -1 });
  useFrame(() => {
    if (!asset || !kit || sampleBuffer.head === 0) return;
    const u = kit.uniforms;
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
    applyDeform(u, deform);
    u.uPressure.value.set(
      sampleBuffer.latest(F.pLV),
      sampleBuffer.latest(F.pRV),
      sampleBuffer.latest(F.pLA),
      sampleBuffer.latest(F.pRA),
    );
    u.uActivation.value.set(sampleBuffer.latest(F.eV), sampleBuffer.latest(F.eA));

    // Lembi valvolari guidati dai flussi del motore
    const t = sampleBuffer.latest(F.t);
    const dt = frame.current.lastT < 0 ? 0 : Math.min(Math.max(t - frame.current.lastT, 0), 0.05);
    frame.current.lastT = t;
    kit.valves.update(dt, useSimulation.getState().params);
    const angles = u.uLeafAngle.value;
    const leaflets = asset.meta.leaflets;
    for (let i = 0; i < MAX_LEAFLETS; i++) {
      const l = leaflets[i];
      angles[i] = l ? kit.valves.angle(l.valve, l.restElevation) : 0;
    }

    if (mode === 'sezione') {
      sectionPlane(asset.meta, section, offset, plane);
      const cap = capRef.current;
      if (cap) {
        plane.coplanarPoint(cap.position);
        cap.quaternion.copy(capQuat.setFromUnitVectors(Z, plane.normal));
      }
    }
  });

  if (!asset || !kit || !materials) return null;
  const onDouble = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const text = labelFor(asset.geometry, e.face?.a ?? -1, mode);
    if (text) setLabel({ text, x: e.point.x, y: e.point.y, z: e.point.z });
  };
  return (
    <group>
      {mode === 'sezione' && (
        <>
          <mesh
            geometry={asset.geometry}
            material={[kit.stBack, kit.stBackHole, kit.hidden, kit.hidden]}
            renderOrder={1}
            frustumCulled={false}
          />
          <mesh
            geometry={asset.geometry}
            material={[kit.stFront, kit.stFrontHole, kit.hidden, kit.hidden]}
            renderOrder={1}
            frustumCulled={false}
          />
          <mesh ref={capRef} material={kit.cap} renderOrder={2} frustumCulled={false}>
            <planeGeometry args={[60, 60]} />
          </mesh>
        </>
      )}
      <mesh
        geometry={asset.geometry}
        material={materials}
        renderOrder={3}
        frustumCulled={false}
        onDoubleClick={onDouble}
      />
      {mode !== 'esterna' && mode !== 'attivazione' && (
        <FlowParticles
          paths={asset.meta.paths}
          uniforms={kit.uniforms}
          clip={mode === 'sezione' ? plane : null}
        />
      )}
    </group>
  );
}

const Z = new Vector3(0, 0, 1);
const capQuat = new Quaternion();
