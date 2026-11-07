/**
 * Emodinamica — cuore 3D PROCEDURALE (nessun asset esterno). Contorni luminosi (Fresnel) su
 * fondo nero. I ventricoli sono ellissoidi prolati i cui semiassi si ricavano INVERTENDO il
 * volume calcolato dal motore: la mesh È il modello. Vasi come tubi su curve CatmullRom,
 * serbatoio venoso distensibile, setto con curvatura che si inverte quando P(VD) > P(VS).
 */
import { OrbitControls } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { Bloom, EffectComposer } from '@react-three/postprocessing';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { SAMPLE, SAMPLE_STRIDE } from '../worker/protocol';
import { getSamples, useStore } from '../store';
import { createFresnelMaterial } from './fresnelMaterial';

function lastSample(field: number): number {
  const { buffer, count } = getSamples();
  if (count < 1) return 0;
  return buffer[(count - 1) * SAMPLE_STRIDE + field] ?? 0;
}

/** Semiasse corto di un ellissoide prolato di volume V (cm³) e rapporto d'asse AR. */
function shortAxis(volumeMl: number, ar: number): number {
  const v = Math.max(volumeMl, 5) * 0.55; // scala cm→unità di scena
  return Math.cbrt((3 * v) / (4 * Math.PI * ar));
}

function applyCommon(mat: THREE.ShaderMaterial, scalar: number): void {
  const st = useStore.getState();
  mat.uniforms.uMode!.value = st.viewMode === 'analitica' ? 1 : 0;
  mat.uniforms.uCut!.value = st.showSection ? 1 : 0;
  mat.uniforms.uScalar!.value = scalar;
}

function Ventricle({
  volField,
  ar,
  x,
  color,
  scalarFor,
}: {
  volField: number;
  ar: number;
  x: number;
  color: string;
  scalarFor: () => number;
}) {
  const ref = useRef<THREE.Mesh>(null);
  const mat = useMemo(() => createFresnelMaterial(color), [color]);
  useFrame(() => {
    const m = ref.current;
    if (!m) return;
    const v = lastSample(volField);
    const b = shortAxis(v, ar);
    m.scale.set(b, b * ar, b);
    applyCommon(mat, scalarFor());
  });
  return (
    <mesh ref={ref} position={[x, 0, 0]} material={mat}>
      <sphereGeometry args={[1, 32, 24]} />
    </mesh>
  );
}

function Atrium({ volField, x, y, color }: { volField: number; x: number; y: number; color: string }) {
  const ref = useRef<THREE.Mesh>(null);
  const mat = useMemo(() => createFresnelMaterial(color), [color]);
  useFrame(() => {
    const m = ref.current;
    if (!m) return;
    const v = lastSample(volField);
    const s = shortAxis(Math.max(v, 20), 1.0) * 0.9;
    m.scale.setScalar(s);
    applyCommon(mat, 0.3);
  });
  return (
    <mesh ref={ref} position={[x, y, 0]} material={mat}>
      <sphereGeometry args={[1, 24, 18]} />
    </mesh>
  );
}

function Vessel({
  points,
  color,
  radius = 0.28,
}: {
  points: [number, number, number][];
  color: string;
  radius?: number;
}) {
  const mat = useMemo(() => createFresnelMaterial(color), [color]);
  const geo = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
    return new THREE.TubeGeometry(curve, 40, radius, 12, false);
  }, [points, radius]);
  useFrame(() => applyCommon(mat, 0.5));
  return <mesh geometry={geo} material={mat} />;
}

/** Serbatoio venoso di capacitanza: raggio ∝ volume stressato (viola). */
function Reservoir() {
  const ref = useRef<THREE.Mesh>(null);
  const mat = useMemo(() => createFresnelMaterial('#9b5cff'), []);
  useFrame(() => {
    const m = ref.current;
    if (!m) return;
    const sv = useStore.getState().beat?.stressedVolume ?? 1100;
    const s = 1.3 + (sv / 1100) * 0.7;
    m.scale.set(s, s * 0.7, s);
    applyCommon(mat, 0.15);
  });
  return (
    <mesh ref={ref} position={[0, -3.1, -0.6]} material={mat}>
      <sphereGeometry args={[1, 24, 16]} />
    </mesh>
  );
}

/** Setto interventricolare: la curvatura si inverte quando P(VD) supera P(VS). */
function Septum() {
  const ref = useRef<THREE.Mesh>(null);
  const mat = useMemo(() => {
    const m = createFresnelMaterial('#ff8a5c');
    m.uniforms.uGlow!.value = 0.8;
    return m;
  }, []);
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(2.2, 3.4, 10, 16);
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const px = pos.getX(i);
      const py = pos.getY(i);
      const dome = Math.cos((px / 1.1) * (Math.PI / 2)) * Math.cos((py / 1.7) * (Math.PI / 2));
      pos.setZ(i, dome); // cupola di riferimento lungo z locale
    }
    g.computeVertexNormals();
    return g;
  }, []);
  useFrame(() => {
    const m = ref.current;
    if (!m) return;
    const plv = lastSample(SAMPLE.plv);
    const prv = lastSample(SAMPLE.prv);
    // curvatura positiva verso il VD (−x); si inverte se P(VD) > P(VS).
    const curv = THREE.MathUtils.clamp((plv - prv) / 60, -0.9, 0.9);
    m.scale.z = 0.2 + curv; // può diventare negativo (inversione)
    applyCommon(mat, 0.5);
  });
  return (
    <mesh ref={ref} geometry={geo} rotation={[0, Math.PI / 2, 0]} position={[-0.1, 0, 0]} material={mat} />
  );
}

/** Particelle di flusso lungo una curva, additive; densità/velocità ∝ portata. */
function FlowParticles({
  points,
  color,
  n,
  flowFor,
}: {
  points: [number, number, number][];
  color: string;
  n: number;
  flowFor: () => number;
}) {
  const ref = useRef<THREE.Points>(null);
  const curve = useMemo(
    () => new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p))),
    [points],
  );
  const offsets = useMemo(() => Float32Array.from({ length: n }, (_, i) => i / n), [n]);
  const positions = useMemo(() => new Float32Array(n * 3), [n]);
  const phase = useRef(0);
  const mat = useMemo(
    () =>
      new THREE.PointsMaterial({
        color: new THREE.Color(color),
        size: 0.14,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true,
      }),
    [color],
  );
  useFrame((_, dt) => {
    const flow = flowFor();
    phase.current = (phase.current + dt * (0.05 + flow * 0.05)) % 1;
    const p = ref.current;
    if (!p) return;
    const attr = p.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < n; i++) {
      let u = (offsets[i]! + phase.current) % 1;
      if (u < 0) u += 1;
      const pt = curve.getPointAt(u);
      attr.setXYZ(i, pt.x, pt.y, pt.z);
    }
    attr.needsUpdate = true;
  });
  return (
    <points ref={ref} material={mat}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
    </points>
  );
}

const AORTA: [number, number, number][] = [
  [0.9, 1.4, 0.2],
  [0.8, 2.6, 0.1],
  [0.2, 3.4, -0.2],
  [-0.6, 3.2, -0.6],
  [-0.7, 1.8, -0.9],
  [-0.6, -0.5, -1.0],
];
const PA: [number, number, number][] = [
  [-1.3, 1.3, 0.4],
  [-1.5, 2.6, 0.3],
  [-2.2, 3.1, 0.0],
  [-3.0, 2.8, -0.2],
];
const VENE_CAVE: [number, number, number][] = [
  [-1.4, -2.6, 0.2],
  [-1.5, -0.2, 0.3],
  [-1.6, 1.0, 0.4],
];
const VENE_POLM: [number, number, number][] = [
  [1.9, 2.4, -0.7],
  [1.4, 1.9, -0.5],
  [1.0, 1.4, -0.3],
];

function ventScalar(volField: number, pField: number): number {
  const st = useStore.getState();
  const v = lastSample(volField);
  const p = lastSample(pField);
  const r = shortAxis(v, 1.6);
  switch (st.analyticVar) {
    case 'stress':
      return THREE.MathUtils.clamp((p * r) / 120, 0, 1); // Laplace ∝ P·r
    case 'perfusione':
      return THREE.MathUtils.clamp((st.beat?.districtFlow[4] ?? 0.25) / 0.6, 0, 1);
    case 'mvo2':
      return THREE.MathUtils.clamp((st.oxygen?.mvo2 ?? 20) / 60, 0, 1);
  }
}

function Content() {
  const co = () => useStore.getState().beat?.co ?? 5;
  return (
    <group scale={0.9}>
      <ambientLight intensity={0.3} />
      <Ventricle
        volField={SAMPLE.vlv}
        ar={1.7}
        x={0.95}
        color="#ff5a3c"
        scalarFor={() => ventScalar(SAMPLE.vlv, SAMPLE.plv)}
      />
      <Ventricle
        volField={SAMPLE.vrv}
        ar={1.5}
        x={-1.25}
        color="#3b74ff"
        scalarFor={() => ventScalar(SAMPLE.vrv, SAMPLE.prv)}
      />
      <Septum />
      <Atrium volField={SAMPLE.vlv} x={1.3} y={1.9} color="#ff8f6b" />
      <Atrium volField={SAMPLE.vrv} x={-1.6} y={1.9} color="#5a8cff" />
      <Vessel points={AORTA} color="#ff6a3c" />
      <Vessel points={PA} color="#16c7d6" />
      <Vessel points={VENE_CAVE} color="#3b74ff" radius={0.3} />
      <Vessel points={VENE_POLM} color="#16c7d6" radius={0.22} />
      <Reservoir />
      <FlowParticles points={AORTA} color="#ffb199" n={240} flowFor={co} />
      <FlowParticles points={PA} color="#8fe8f2" n={200} flowFor={co} />
    </group>
  );
}

export default function HeartScene() {
  const bloom = useStore((s) => s.bloom);
  const viewMode = useStore((s) => s.viewMode);
  const useBloom = bloom && viewMode === 'estetica';
  return (
    <Canvas
      gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
      dpr={[1, 2]}
      camera={{ position: [0, 0.5, 9], fov: 42 }}
      style={{ background: 'transparent' }}
    >
      <Content />
      <OrbitControls enablePan={false} enableZoom minPolarAngle={0.4} maxPolarAngle={2.6} rotateSpeed={0.7} />
      {useBloom ? (
        <EffectComposer>
          <Bloom intensity={0.8} luminanceThreshold={0.15} luminanceSmoothing={0.3} mipmapBlur />
        </EffectComposer>
      ) : (
        <></>
      )}
    </Canvas>
  );
}
