/**
 * Emodinamica — cuore 3D PROCEDURALE (nessun asset esterno). Contorni luminosi (Fresnel) su
 * fondo nero. Le camere hanno forma anatomica (apice appuntito, VD a semiluna/D), i vasi sono
 * tubi affusolati e ramificati (arco aortico con tronchi sovraortici, biforcazione polmonare).
 * Il volume del motore guida la scala delle camere, ancorata all'apice: la mesh resta il modello.
 */
import { AdaptiveDpr, OrbitControls, PerformanceMonitor } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { Bloom, EffectComposer } from '@react-three/postprocessing';
import { useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { SAMPLE, SAMPLE_STRIDE } from '../worker/protocol';
import { getSamples, useStore } from '../store';
import { CENTERLINES, atriumGeometry, buildVessels, ventricleGeometry } from './cardiacGeometry';
import { createFresnelMaterial } from './fresnelMaterial';

type V3 = [number, number, number];

function lastSample(field: number): number {
  const { buffer, count } = getSamples();
  if (count < 1) return 0;
  return buffer[(count - 1) * SAMPLE_STRIDE + field] ?? 0;
}

function applyCommon(mat: THREE.ShaderMaterial, scalar: number): void {
  const st = useStore.getState();
  mat.uniforms.uMode!.value = st.viewMode === 'analitica' ? 1 : 0;
  mat.uniforms.uCut!.value = st.showSection ? 1 : 0;
  mat.uniforms.uScalar!.value = scalar;
}

function Ventricle({
  volField,
  vref,
  length,
  rMax,
  crescent,
  septalAngle,
  pos,
  color,
  scalarFor,
}: {
  volField: number;
  vref: number;
  length: number;
  rMax: number;
  crescent: boolean;
  septalAngle: number;
  pos: V3;
  color: string;
  scalarFor: () => number;
}) {
  const ref = useRef<THREE.Mesh>(null);
  const mat = useMemo(() => createFresnelMaterial(color), [color]);
  const geo = useMemo(
    () => ventricleGeometry({ length, rMax, crescent, septalAngle }),
    [length, rMax, crescent, septalAngle],
  );
  useFrame(() => {
    const m = ref.current;
    if (!m) return;
    const rho = Math.max(lastSample(volField), 15) / vref;
    const radial = Math.pow(rho, 0.46);
    const axial = Math.pow(rho, 0.12);
    m.scale.set(radial, axial, radial);
    applyCommon(mat, scalarFor());
  });
  return <mesh ref={ref} geometry={geo} material={mat} position={pos} />;
}

function Atrium({
  volField,
  vref,
  pos,
  radius,
  color,
  appendage,
}: {
  volField: number;
  vref: number;
  pos: V3;
  radius: number;
  color: string;
  appendage: V3;
}) {
  const ref = useRef<THREE.Mesh>(null);
  const mat = useMemo(() => createFresnelMaterial(color), [color]);
  const geo = useMemo(() => atriumGeometry(radius, appendage), [radius, appendage]);
  useFrame(() => {
    const m = ref.current;
    if (!m) return;
    const rho = Math.max(lastSample(volField), 20) / vref;
    const s = Math.pow(rho, 0.33) * 0.55;
    m.scale.setScalar(s);
    applyCommon(mat, 0.28);
  });
  return <mesh ref={ref} geometry={geo} material={mat} position={pos} />;
}

function makeVesselMat(color: string, glow: number): THREE.ShaderMaterial {
  const m = createFresnelMaterial(color);
  m.uniforms.uGlow!.value = glow;
  m.uniforms.uPower!.value = 2.6;
  return m;
}

function Vessels() {
  const geos = useMemo(() => buildVessels(), []);
  const matAorta = useMemo(() => makeVesselMat('#ff6a3c', 0.85), []);
  const matPulm = useMemo(() => makeVesselMat('#16c7d6', 0.72), []);
  const matCaval = useMemo(() => makeVesselMat('#3b74ff', 0.5), []);
  const matVeins = useMemo(() => makeVesselMat('#17b6c7', 0.5), []);
  useFrame(() => {
    applyCommon(matAorta, 0.75);
    applyCommon(matPulm, 0.4);
    applyCommon(matCaval, 0.25);
    applyCommon(matVeins, 0.4);
  });
  return (
    <>
      <mesh geometry={geos.aorta} material={matAorta} />
      <mesh geometry={geos.pulm} material={matPulm} />
      <mesh geometry={geos.caval} material={matCaval} />
      <mesh geometry={geos.pulmVeins} material={matVeins} />
    </>
  );
}

/** Serbatoio venoso di capacitanza: raggio ∝ volume stressato (viola). */
function Reservoir() {
  const ref = useRef<THREE.Mesh>(null);
  const mat = useMemo(() => createFresnelMaterial('#9b5cff'), []);
  useFrame(() => {
    const m = ref.current;
    if (!m) return;
    const sv = useStore.getState().beat?.stressedVolume ?? 1100;
    const s = 0.85 + (sv / 1100) * 0.4;
    m.scale.set(s, s * 0.6, s);
    applyCommon(mat, 0.15);
  });
  return (
    <mesh ref={ref} position={[0.1, -2.45, -0.8]} material={mat}>
      <sphereGeometry args={[1, 24, 16]} />
    </mesh>
  );
}

/** Setto interventricolare: la curvatura si inverte quando P(VD) supera P(VS). */
function Septum() {
  const ref = useRef<THREE.Mesh>(null);
  const mat = useMemo(() => {
    const m = createFresnelMaterial('#ff8a5c');
    m.uniforms.uGlow!.value = 0.75;
    return m;
  }, []);
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(1.7, 2.5, 10, 16);
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const px = pos.getX(i);
      const py = pos.getY(i);
      const dome = Math.cos((px / 0.95) * (Math.PI / 2)) * Math.cos((py / 1.5) * (Math.PI / 2));
      pos.setZ(i, dome);
    }
    g.computeVertexNormals();
    return g;
  }, []);
  useFrame(() => {
    const m = ref.current;
    if (!m) return;
    const plv = lastSample(SAMPLE.plv);
    const prv = lastSample(SAMPLE.prv);
    const curv = THREE.MathUtils.clamp((plv - prv) / 60, -0.9, 0.9);
    m.scale.z = 0.2 + curv;
    applyCommon(mat, 0.5);
  });
  return (
    <mesh
      ref={ref}
      geometry={geo}
      rotation={[0, Math.PI / 2, 0]}
      position={[0.12, -0.1, 0.15]}
      material={mat}
    />
  );
}

/** Particelle di flusso lungo una linea centrale, additive; densità/velocità ∝ portata. */
function FlowParticles({
  points,
  color,
  n,
  flowFor,
}: {
  points: V3[];
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
        size: 0.085,
        transparent: true,
        opacity: 0.5,
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

const AORTA_PATH = CENTERLINES.aorta;
const PULM_PATH: V3[] = [...CENTERLINES.pulmTrunk, ...CENTERLINES.pulmL.slice(1)];

function ventScalar(volField: number, pField: number): number {
  const st = useStore.getState();
  const v = lastSample(volField);
  const p = lastSample(pField);
  const r = Math.cbrt(Math.max(v, 10));
  switch (st.analyticVar) {
    case 'stress':
      return THREE.MathUtils.clamp((p * r) / 420, 0, 1); // Laplace ∝ P·r
    case 'perfusione':
      return THREE.MathUtils.clamp((st.beat?.districtFlow[4] ?? 0.25) / 0.6, 0, 1);
    case 'mvo2':
      return THREE.MathUtils.clamp((st.oxygen?.mvo2 ?? 20) / 60, 0, 1);
  }
}

function Content({ low }: { low: boolean }) {
  const co = () => useStore.getState().beat?.co ?? 5;
  const nA = low ? 120 : 240;
  const nP = low ? 100 : 200;
  return (
    <group rotation={[0.12, -0.12, 0.2]} position={[0.05, 0.1, 0]} scale={0.62}>
      <ambientLight intensity={0.3} />
      <Ventricle
        volField={SAMPLE.vlv}
        vref={120}
        length={3.0}
        rMax={1.2}
        crescent={false}
        septalAngle={2.68}
        pos={[0.5, -1.5, 0.1]}
        color="#ff5a3c"
        scalarFor={() => ventScalar(SAMPLE.vlv, SAMPLE.plv)}
      />
      <Ventricle
        volField={SAMPLE.vrv}
        vref={130}
        length={2.75}
        rMax={1.42}
        crescent
        septalAngle={-0.46}
        pos={[-0.15, -1.35, 0.42]}
        color="#3b74ff"
        scalarFor={() => ventScalar(SAMPLE.vrv, SAMPLE.prv)}
      />
      <Septum />
      <Atrium
        volField={SAMPLE.vlv}
        vref={120}
        pos={[1.3, 1.45, -0.55]}
        radius={0.98}
        color="#ff8f6b"
        appendage={[0.7, 0.3, -0.4]}
      />
      <Atrium
        volField={SAMPLE.vrv}
        vref={130}
        pos={[-0.7, 1.35, 0.5]}
        radius={1.02}
        color="#5a8cff"
        appendage={[-0.6, 0.4, 0.5]}
      />
      <Vessels />
      <Reservoir />
      <FlowParticles points={AORTA_PATH} color="#ff8352" n={nA} flowFor={co} />
      <FlowParticles points={PULM_PATH} color="#4fcfe0" n={nP} flowFor={co} />
    </group>
  );
}

export default function HeartScene() {
  const bloom = useStore((s) => s.bloom);
  const viewMode = useStore((s) => s.viewMode);
  const [low, setLow] = useState(false);
  const useBloom = bloom && viewMode === 'estetica' && !low;
  return (
    <Canvas
      gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
      dpr={[1, 2]}
      camera={{ position: [0, 0.3, 9.5], fov: 42 }}
      style={{ background: 'transparent' }}
    >
      <PerformanceMonitor onDecline={() => setLow(true)} onIncline={() => setLow(false)} />
      <AdaptiveDpr pixelated />
      <Content low={low} />
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
