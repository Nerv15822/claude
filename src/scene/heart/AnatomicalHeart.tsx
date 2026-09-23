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
  type Group,
  ReplaceStencilOp,
  Vector3,
  type Mesh,
} from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import { F } from '@physiology/engine';
import { useView } from '../viewStore';
import { loadAnatomy, type AnatomyAsset } from './anatomicalAsset';
import { MAX_LEAFLETS } from './deformGlsl';
import { computeDeform, createDeformState } from './deformation';
import {
  applyDeform,
  createHeartUniforms,
  septumDirection,
  createStencilMaterials,
  createSurfaceMaterial,
  type HeartUniforms,
} from './heartMaterial';
import { FlowParticles } from './FlowParticles';
import { IabpBalloon } from './IabpBalloon';
import { labelFor } from './labels';
import { sectionPlane } from './sectionPlanes';
import { patientSource, type HeartSource } from './heartSource';
import { septumFrame } from './septumFrame';
import { buildShuntPaths } from './shuntPaths';
import { ValveDynamics } from './valveDynamics';

interface Props {
  onReady?: () => void;
  onError?: () => void;
  /** Dati del cuore da rappresentare (paziente o normale di riferimento) */
  source?: HeartSource;
  /** Gruppo radice (usato dal rendering a schermo diviso del confronto) */
  groupRef?: React.Ref<Group>;
}

/** Particelle negli shunt, in sovrimpressione: poche, per ogni qualità */
const SHUNT_COUNTS = { alta: 900, media: 600, bassa: 300 } as const;

const GROUP_ORDER = ['exterior', 'cavities', 'papillary', 'valves'] as const;

/**
 * Cuore anatomico reale (BodyParts3D) guidato dal motore: deformazione, lembi valvolari, modalità
 * di visualizzazione (esterna, sezione con capping a stencil, raggi X, heatmap di pressione, attivazione).
 */
export function AnatomicalHeart({ onReady, onError, source = patientSource, groupRef }: Props) {
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
    const m = asset.meta;
    const g = asset.geometry;
    const septum = septumFrame(
      g.getAttribute('position').array,
      codesOf(g.getAttribute('aSurface').array),
      m.lvApex,
      m.longAxis,
      m.baseApexLength,
      septumDirection(m).toArray(),
    );
    const uniforms: HeartUniforms = createHeartUniforms({ ...m, septum });
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
      valves: new ValveDynamics(source.buffer),
    };
  }, [asset, plane, source]);

  useEffect(
    () => () => {
      if (!kit) return;
      for (const m of Object.values(kit)) if (m instanceof Material) m.dispose();
    },
    [kit],
  );

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

  // Percorsi degli shunt (DIA, DIV, dotto): particelle in sovrimpressione, perché attraversano il miocardio
  const shuntPaths = useMemo(() => {
    if (!asset) return [];
    const m = asset.meta;
    const pl = sectionPlane(m, 'quattroCamere', 0, new Plane());
    const plane = { normal: pl.normal.toArray(), constant: pl.constant };
    return buildShuntPaths(m.paths, m.valveCenters[1]?.[1] ?? 0, plane);
  }, [asset]);

  // Percorso arterioso che termina più in basso: aorta discendente (sede del pallone dell'IABP)
  const descending = useMemo(() => {
    if (!asset) return null;
    const endY = (p: (typeof asset.meta.paths)[number]) => p.data[p.data.length - p.stride + 1]!;
    return asset.meta.paths.filter((p) => p.side === 1).sort((a, b) => endY(a) - endY(b))[0] ?? null;
  }, [asset]);

  const frame = useRef({ lastT: -1 });
  useFrame(() => {
    const buf = source.buffer;
    if (!asset || !kit || buf.head === 0) return;
    const u = kit.uniforms;
    computeDeform(
      deform,
      buf.latest(F.vLV),
      buf.latest(F.vRV),
      buf.latest(F.vLA),
      buf.latest(F.vRA),
      buf.latest(F.pAo),
      buf.latest(F.pPA),
      buf.latest(F.eV),
      asset.meta.refVolume,
      buf.latest(F.vSpt),
      source.morphology(),
    );
    applyDeform(u, deform);
    u.uPressure.value.set(buf.latest(F.pLV), buf.latest(F.pRV), buf.latest(F.pLA), buf.latest(F.pRA));
    u.uActivation.value.set(buf.latest(F.eV), buf.latest(F.eA));

    // Lembi valvolari guidati dai flussi del motore
    const t = buf.latest(F.t);
    const dt = frame.current.lastT < 0 ? 0 : Math.min(Math.max(t - frame.current.lastT, 0), 0.05);
    frame.current.lastT = t;
    kit.valves.update(dt, source.params());
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
    <group ref={groupRef ?? null}>
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
      {descending && source.id === 'paziente' && <IabpBalloon path={descending} />}
      {mode !== 'esterna' && mode !== 'attivazione' && (
        <>
          <FlowParticles
            paths={asset.meta.paths}
            uniforms={kit.uniforms}
            clip={mode === 'sezione' ? plane : null}
            source={source}
          />
          <FlowParticles
            paths={shuntPaths}
            uniforms={kit.uniforms}
            clip={null}
            source={source}
            counts={SHUNT_COUNTS}
            overlay
          />
        </>
      )}
    </group>
  );
}

const Z = new Vector3(0, 0, 1);

/** Codici di superficie (componente y di aSurface). */
function codesOf(surface: ArrayLike<number>): Float32Array {
  const out = new Float32Array(surface.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = surface[i * 2 + 1]!;
  return out;
}
const capQuat = new Quaternion();
