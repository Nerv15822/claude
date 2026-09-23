import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import {
  BufferAttribute,
  CatmullRomCurve3,
  MeshPhysicalMaterial,
  TubeGeometry,
  Vector3,
  type WebGLProgramParametersWithUniforms,
} from 'three';
import { F } from '@physiology/engine';
import { sampleBuffer } from '@store/sampleBuffer';
import { useSimulation } from '@store/simulation';
import type { FlowPath } from './anatomicalAsset';

interface Props {
  /** Percorso arterioso che termina nell'aorta discendente */
  path: FlowPath;
}

const RINGS = 48;
const RADIAL = 20;

/**
 * Pallone del contropulsatore aortico nell'aorta discendente: il raggio segue il volume del pallone
 * calcolato dal motore (gonfiaggio all'incisura dicrota, sgonfiaggio al QRS). Il catetere prosegue
 * verso il basso (accesso femorale).
 */
export function IabpBalloon({ path }: Props) {
  const enabled = useSimulation((s) => s.params.iabp.enabled);
  const volume = useSimulation((s) => s.params.iabp.volume);

  const { geometry, catheter } = useMemo(() => {
    const d = path.data;
    const n = d.length / path.stride;
    const pts: Vector3[] = [];
    const radii: number[] = [];
    let top = 0;
    for (let i = 0; i < n; i++) {
      const y = d[i * path.stride + 1]!;
      if (y > d[top * path.stride + 1]!) top = i;
    }
    // Aorta discendente: dal punto più alto dell'arco verso il basso, dopo l'emergenza della succlavia
    const start = Math.min(top + Math.round((n - top) * 0.2), n - 8);
    for (let i = start; i < n; i++) {
      const o = i * path.stride;
      pts.push(new Vector3(d[o], d[o + 1], d[o + 2]));
      radii.push(d[o + 3]!);
    }
    const curve = new CatmullRomCurve3(pts);
    const g = new TubeGeometry(curve, RINGS, 1, RADIAL, false);
    // Raggio pieno per anello (85% del lume) con estremità affusolate; centro dell'anello per lo shader
    const pos = g.getAttribute('position') as BufferAttribute;
    const center = new Float32Array(pos.count * 3);
    const full = new Float32Array(pos.count);
    const frames = curve.computeFrenetFrames(RINGS, false);
    for (let i = 0; i <= RINGS; i++) {
      const t = i / RINGS;
      const c = curve.getPointAt(t);
      const r = (radii[Math.min(Math.round(t * (radii.length - 1)), radii.length - 1)] ?? 0.8) * 0.85;
      const taper = Math.min(1, Math.sin(Math.PI * t) * 3);
      for (let j = 0; j <= RADIAL; j++) {
        const k = i * (RADIAL + 1) + j;
        center.set([c.x, c.y, c.z], k * 3);
        full[k] = r * Math.max(taper, 0.12);
        const nrm = frames.normals[i]!;
        const bin = frames.binormals[i]!;
        const a = (j / RADIAL) * Math.PI * 2;
        pos.setXYZ(
          k,
          c.x + Math.cos(a) * nrm.x + Math.sin(a) * bin.x,
          c.y + Math.cos(a) * nrm.y + Math.sin(a) * bin.y,
          c.z + Math.cos(a) * nrm.z + Math.sin(a) * bin.z,
        );
      }
    }
    g.setAttribute('aCenter', new BufferAttribute(center, 3));
    g.setAttribute('aFull', new BufferAttribute(full, 1));
    g.computeVertexNormals();
    const end = pts[pts.length - 1]!;
    const dir = end
      .clone()
      .sub(pts[pts.length - 2]!)
      .normalize();
    const cat = new TubeGeometry(
      new CatmullRomCurve3([pts[0]!, ...pts.slice(1), end.clone().addScaledVector(dir, 12)]),
      64,
      0.08,
      8,
      false,
    );
    return { geometry: g, catheter: cat };
  }, [path]);

  const material = useMemo(() => {
    const m = new MeshPhysicalMaterial({
      color: '#e8f0ff',
      roughness: 0.25,
      metalness: 0,
      transmission: 0.4,
      transparent: true,
      opacity: 0.75,
      clearcoat: 1,
      emissive: '#223355',
    });
    const uniforms = { uInflate: { value: 0 } };
    m.userData.uniforms = uniforms;
    m.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nattribute vec3 aCenter;\nattribute float aFull;\nuniform float uInflate;',
        )
        .replace(
          '#include <begin_vertex>',
          `vec3 csDir = position - aCenter;
vec3 transformed = aCenter + csDir * aFull * mix(0.1, 1.0, uInflate);`,
        );
    };
    m.customProgramCacheKey = () => 'iabp-balloon';
    return m;
  }, []);
  const catheterMaterial = useMemo(() => new MeshPhysicalMaterial({ color: '#d8dde6', roughness: 0.4 }), []);

  useEffect(
    () => () => {
      geometry.dispose();
      catheter.dispose();
      material.dispose();
      catheterMaterial.dispose();
    },
    [geometry, catheter, material, catheterMaterial],
  );

  useFrame(() => {
    const u = material.userData.uniforms as { uInflate: { value: number } };
    const v = sampleBuffer.head > 0 ? sampleBuffer.latest(F.balloon) : 0;
    // Raggio ∝ √volume (sezione del pallone ∝ volume a lunghezza fissa)
    u.uInflate.value = volume > 0 ? Math.sqrt(Math.min(Math.max(v / volume, 0), 1)) : 0;
  });

  if (!enabled) return null;
  return (
    <group>
      <mesh geometry={geometry} material={material} renderOrder={5} frustumCulled={false} />
      <mesh geometry={catheter} material={catheterMaterial} frustumCulled={false} />
    </group>
  );
}
