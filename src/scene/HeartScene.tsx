import { Environment, Lightformer, OrbitControls, PerformanceMonitor } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { ACESFilmicToneMapping, Vector3 } from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { LONG_AXIS } from './heart/anatomy';
import { GlbHeart } from './heart/GlbHeart';
import { GLB_URL } from './heart/glbNaming';
import { HeartMesh } from './heart/HeartMesh';
import { useView, type ViewPreset } from './viewStore';

/** Centro dell'anatomia (cm). */
const CENTER = new Vector3(0.6, 2.4, -0.6);

/** Direzione della camera per le viste predefinite. */
function presetDirection(v: ViewPreset): Vector3 {
  switch (v) {
    case 'anteriore':
      return new Vector3(0, 0.08, 1).normalize();
    case 'posteriore':
      return new Vector3(0, 0.08, -1).normalize();
    case 'sinistra':
      return new Vector3(1, 0.05, -0.05).normalize();
    case 'apice':
      return new Vector3(...LONG_AXIS).normalize();
    case 'base':
      return new Vector3(-0.15, 1, 0.3).normalize();
  }
}

/**
 * Distanza che inquadra l'anatomia (~25 cm) in funzione dell'aspetto. In verticale il bersaglio è
 * spostato in basso perché la parte inferiore dello schermo è coperta dal pannello.
 */
function framing(aspect: number, fovDeg: number): { distance: number; yShift: number } {
  const half = (fovDeg * Math.PI) / 360;
  const hHalf = Math.atan(Math.tan(half) * aspect);
  const size = 10.5;
  const distance = Math.max(size / Math.tan(half), (size / Math.tan(hHalf)) * 0.92);
  return { distance, yShift: aspect < 1 ? -distance * Math.tan(half) * 0.32 : 0 };
}

function CameraRig({ controls }: { controls: React.RefObject<OrbitControlsImpl | null> }) {
  const preset = useView((s) => s.preset);
  const nonce = useView((s) => s.nonce);
  const { camera, size } = useThree();
  const goal = useRef<Vector3 | null>(null);
  const goalTarget = useRef(new Vector3());
  useEffect(() => {
    const { distance, yShift } = framing(size.width / size.height, 35);
    const shift = new Vector3(0, yShift, 0);
    goalTarget.current.copy(CENTER).add(shift);
    goal.current = CENTER.clone().add(presetDirection(preset).multiplyScalar(distance)).add(shift);
  }, [preset, nonce, size.width, size.height]);
  useFrame((_, dt) => {
    if (!goal.current) return;
    const k = 1 - Math.exp(-dt * 6);
    camera.position.lerp(goal.current, k);
    controls.current?.target.lerp(goalTarget.current, k);
    controls.current?.update();
    if (camera.position.distanceTo(goal.current) < 0.05) goal.current = null;
  });
  return null;
}

/** Scena 3D: illuminazione da studio/sala operatoria (lightformer procedurali), cuore e controlli touch. */
export function HeartScene() {
  const controls = useRef<OrbitControlsImpl | null>(null);
  const [dpr, setDpr] = useState(Math.min(window.devicePixelRatio, 2));
  const quality = useView((s) => s.quality);
  const [ready, setReady] = useState(false);
  const onReady = useCallback(() => setReady(true), []);
  const cell = quality === 'alta' ? 0.2 : quality === 'media' ? 0.26 : 0.34;
  // Se esiste public/models/heart.glb si usa il modello anatomico esterno, altrimenti quello procedurale.
  const [glb, setGlb] = useState<boolean | null>(null);
  useEffect(() => {
    fetch(GLB_URL, { method: 'HEAD' })
      .then((r) => {
        const type = r.headers.get('content-type') ?? '';
        setGlb(r.ok && !type.includes('text/html'));
      })
      .catch(() => setGlb(false));
  }, []);

  return (
    <>
      <Canvas
        dpr={dpr}
        camera={{ position: [0.6, 3, 60], fov: 35, near: 1, far: 400 }}
        gl={{ antialias: true, powerPreference: 'high-performance', toneMapping: ACESFilmicToneMapping }}
        style={{ position: 'absolute', inset: 0, touchAction: 'none' }}
      >
        <PerformanceMonitor
          onIncline={() => setDpr((d) => Math.min(d + 0.25, Math.min(window.devicePixelRatio, 2)))}
          onDecline={() => setDpr((d) => Math.max(d - 0.25, 1))}
        />
        <Environment resolution={256} frames={1}>
          <Lightformer
            form="rect"
            intensity={3}
            color="#fff4ea"
            position={[0, 12, 6]}
            scale={[14, 6, 1]}
            rotation-x={Math.PI / 2.4}
          />
          <Lightformer
            form="rect"
            intensity={1.4}
            color="#dfe8ff"
            position={[-14, 4, 8]}
            scale={[8, 12, 1]}
            rotation-y={Math.PI / 3}
          />
          <Lightformer
            form="rect"
            intensity={1.1}
            color="#ffe2d6"
            position={[14, 0, 6]}
            scale={[8, 12, 1]}
            rotation-y={-Math.PI / 3}
          />
          <Lightformer form="circle" intensity={2} color="#ffffff" position={[0, 2, -14]} scale={6} />
          <Lightformer
            form="ring"
            intensity={0.6}
            color="#9fb4ff"
            position={[0, -10, 4]}
            scale={10}
            rotation-x={-Math.PI / 2}
          />
        </Environment>
        <directionalLight position={[6, 14, 18]} intensity={1.2} color="#fff6ee" />
        {glb === true && (
          <Suspense fallback={null}>
            <GlbHeart />
          </Suspense>
        )}
        {glb === false && <HeartMesh cell={cell} onReady={onReady} />}
        <OrbitControls
          ref={controls}
          target={CENTER}
          enableDamping
          dampingFactor={0.08}
          minDistance={12}
          maxDistance={120}
          rotateSpeed={0.7}
          makeDefault
        />
        <CameraRig controls={controls} />
      </Canvas>
      {!ready && !glb && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            color: 'var(--muted)',
            fontSize: 14,
            pointerEvents: 'none',
          }}
        >
          Generazione del modello anatomico…
        </div>
      )}
    </>
  );
}
