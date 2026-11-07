/**
 * Emodinamica — materiale a contorno luminoso (Fresnel) per la scena 3D.
 *
 *  - Estetica: AdditiveBlending, depthWrite off, DoubleSide; colore = ossigenazione/versante.
 *  - Analitica: opacità alzata, bloom spento; colore = grandezza fisica scelta, scala
 *    percettivamente uniforme (mai arcobaleno), con legenda numerica nella UI.
 *
 * `uCut` esegue una sezione semplice scartando i frammenti anteriori (worldPos.z > 0),
 * così l'interno delle camere diventa visibile senza guscio vuoto in primo piano.
 */
import * as THREE from 'three';

export function createFresnelMaterial(color: THREE.ColorRepresentation): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uPower: { value: 2.2 },
      uGlow: { value: 1.0 },
      uMode: { value: 0 }, // 0 estetica (additiva), 1 analitica (opaca)
      uScalar: { value: 0.5 }, // 0..1 per la colormap analitica
      uCut: { value: 0 }, // 0 off, 1 sezione
    },
    vertexShader: /* glsl */ `
      varying vec3 vN;
      varying vec3 vV;
      varying vec3 vWorld;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        vV = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uPower;
      uniform float uGlow;
      uniform float uMode;
      uniform float uScalar;
      uniform float uCut;
      varying vec3 vN;
      varying vec3 vV;
      varying vec3 vWorld;

      // Colormap percettivamente uniforme (approssimazione viridis a 4 tappe).
      vec3 viridis(float t) {
        t = clamp(t, 0.0, 1.0);
        vec3 c0 = vec3(0.267, 0.005, 0.329);
        vec3 c1 = vec3(0.188, 0.407, 0.553);
        vec3 c2 = vec3(0.208, 0.718, 0.472);
        vec3 c3 = vec3(0.993, 0.906, 0.144);
        if (t < 0.33) return mix(c0, c1, t / 0.33);
        if (t < 0.66) return mix(c1, c2, (t - 0.33) / 0.33);
        return mix(c2, c3, (t - 0.66) / 0.34);
      }

      void main() {
        if (uCut > 0.5 && vWorld.z > 0.0) discard;
        float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), uPower);
        if (uMode < 0.5) {
          // Estetica: contorno additivo luminoso.
          vec3 col = uColor * (f * 1.8 + 0.06) * uGlow;
          gl_FragColor = vec4(col, f * 0.95 + 0.04);
        } else {
          // Analitica: superficie più piena colorata dalla grandezza fisica.
          vec3 col = viridis(uScalar);
          float a = mix(0.35, 0.9, f);
          gl_FragColor = vec4(col * (0.6 + 0.6 * f), a);
        }
      }
    `,
  });
}
