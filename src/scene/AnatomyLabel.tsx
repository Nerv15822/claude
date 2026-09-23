import { Html } from '@react-three/drei';
import { useView } from './viewStore';

/** Etichetta anatomica mostrata dopo un doppio tap su una struttura. */
export function AnatomyLabel() {
  const label = useView((s) => s.label);
  const setLabel = useView((s) => s.setLabel);
  if (!label) return null;
  return (
    <group position={[label.x, label.y, label.z]}>
      <mesh>
        <sphereGeometry args={[0.18, 16, 16]} />
        <meshBasicMaterial color="#ffffff" depthTest={false} transparent opacity={0.9} />
      </mesh>
      <Html center style={{ pointerEvents: 'auto' }} position={[0, 0.9, 0]}>
        <button
          onClick={() => setLabel(null)}
          style={{
            whiteSpace: 'nowrap',
            padding: '6px 10px',
            borderRadius: 10,
            border: '1px solid rgba(255,255,255,0.25)',
            background: 'rgba(10,13,19,0.82)',
            color: '#fff',
            font: '600 13px -apple-system, system-ui, sans-serif',
            backdropFilter: 'blur(8px)',
          }}
        >
          {label.text} ✕
        </button>
      </Html>
    </group>
  );
}
