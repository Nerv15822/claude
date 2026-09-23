import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  BufferAttribute,
  BufferGeometry,
  DataTexture,
  FloatType,
  NearestFilter,
  NormalBlending,
  RGBAFormat,
  ShaderMaterial,
  type Plane,
  type Points,
} from 'three';
import { F } from '@physiology/engine';
import { sampleBuffer } from '@store/sampleBuffer';
import { useSimulation } from '@store/simulation';
import { useView } from '../viewStore';
import type { FlowPath } from './anatomicalAsset';
import { DEFORM_PARS } from './deformGlsl';
import type { HeartUniforms } from './heartMaterial';

interface Props {
  paths: FlowPath[];
  uniforms: HeartUniforms;
  clip: Plane | null;
}

/** Ordine dei flussi referenziati dai percorsi (vedi scripts/build-anatomy.ts). */
const FLOWS = [F.qVR, F.qPVin, F.qTV, F.qMV, F.qPV, F.qAV, F.qPULM, F.qSYS];
const COUNT = { alta: 24000, media: 12000, bassa: 5000 } as const;
/** Limite di Nyquist della mappa color-Doppler (cm/s) */
const NYQUIST = 70;

const VERTEX = /* glsl */ `
${DEFORM_PARS}
#include <clipping_planes_pars_vertex>
uniform sampler2D uPaths;
uniform float uPixelRatio;
uniform float uSize;
uniform float uTime;
uniform float uDoppler;
uniform float uSvO2;
uniform float uSaO2;
attribute float aPath;
attribute float aS;
attribute vec3 aRand;
attribute float aVel;
attribute float aSide;
varying vec3 vColor;
varying float vAlpha;

vec4 pathTex(int i, int row) { return texelFetch(uPaths, ivec2(i, int(aPath) * 3 + row), 0); }

void main() {
  int i = int(floor(aS));
  float fr = aS - float(i);
  vec4 a = pathTex(i, 0);
  vec4 b = pathTex(i + 1, 0);
  vec3 c = mix(a.xyz, b.xyz, fr);
  float r = mix(a.w, b.w, fr);
  vec3 t = normalize(b.xyz - a.xyz + 1e-5);
  vec3 up = abs(t.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 nrm = normalize(cross(t, up));
  vec3 bin = cross(t, nrm);
  float ang = aRand.x * 6.2831853;
  // Turbolenza: dispersione casuale proporzionale alla velocità oltre ~1.5 m/s (getti stenotici)
  float turb = clamp((abs(aVel) - 150.0) / 250.0, 0.0, 1.0);
  ang += turb * 3.0 * sin(uTime * 23.0 + aRand.z * 40.0);
  float rad = sqrt(aRand.y) * r * (1.0 + 0.35 * turb * sin(uTime * 17.0 + aRand.z * 13.0));
  vec3 p = c + (cos(ang) * nrm + sin(ang) * bin) * rad;
  vec4 ch = mix(pathTex(i, 1), pathTex(i + 1, 1), fr);
  vec4 ve = mix(pathTex(i, 2), pathTex(i + 1, 2), fr);
  vec3 n = t;
  vec3 dp = csDeform(p, n, ch, ve, c);
  vec4 mvPosition = modelViewMatrix * vec4(dp, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <clipping_planes_vertex>
  gl_PointSize = uSize * uPixelRatio * (40.0 / -mvPosition.z);

  if (uDoppler > 0.5) {
    // Componente della velocità verso l'osservatore; aliasing oltre il limite di Nyquist
    vec3 toCam = normalize(-mvPosition.xyz);
    vec3 tView = normalize((modelViewMatrix * vec4(t, 0.0)).xyz);
    float vd = aVel * dot(tView, toCam);
    float w = mod(vd + ${NYQUIST.toFixed(1)}, ${(2 * NYQUIST).toFixed(1)}) - ${NYQUIST.toFixed(1)};
    float k = clamp(abs(w) / ${NYQUIST.toFixed(1)}, 0.0, 1.0);
    vColor = w > 0.0 ? mix(vec3(0.5, 0.0, 0.0), vec3(1.0, 0.9, 0.2), k) : mix(vec3(0.0, 0.0, 0.5), vec3(0.3, 0.9, 1.0), k);
    // Flusso turbolento: mosaico con componente verde (varianza)
    if (turb > 0.2) vColor = mix(vColor, vec3(0.2, 1.0, 0.3), step(0.5, fract(aRand.z * 7.0 + uTime * 11.0)) * turb);
    vAlpha = mix(0.25, 0.95, clamp(abs(aVel) / 30.0, 0.0, 1.0));
  } else {
    float sat = aSide > 0.5 ? uSaO2 : uSvO2;
    // Rosso ossigenato → blu desaturato (convenzione didattica)
    vColor = mix(vec3(0.25, 0.35, 0.95), vec3(0.95, 0.12, 0.1), smoothstep(0.55, 0.98, sat));
    vAlpha = 0.9;
  }
}
`;

const FRAGMENT = /* glsl */ `
#include <clipping_planes_pars_fragment>
varying vec3 vColor;
varying float vAlpha;
void main() {
  #include <clipping_planes_fragment>
  vec2 d = gl_PointCoord - 0.5;
  float r2 = dot(d, d);
  if (r2 > 0.25) discard;
  float soft = 1.0 - smoothstep(0.12, 0.25, r2);
  gl_FragColor = vec4(vColor * (0.75 + 0.25 * soft), vAlpha * soft);
}
`;

/**
 * Particelle di flusso lungo i percorsi anatomici. La velocità di ogni particella è la velocità media
 * nel lume: v = Q/A, con Q dal motore (interpolato tra ingresso e uscita di ciascun segmento) e A dal
 * raggio locale del lume. Integrazione sul tempo simulato (rispetta pausa e rallenty).
 */
export function FlowParticles({ paths, uniforms, clip }: Props) {
  const quality = useView((s) => s.quality);
  const colorMode = useView((s) => s.particleColor);
  const enabled = useView((s) => s.particles);
  const pointsRef = useRef<Points>(null);
  const gl = useThree((s) => s.gl);

  const data = useMemo(() => {
    const maxPts = Math.max(...paths.map((p) => p.data.length / p.stride));
    const tex = new Float32Array(maxPts * paths.length * 3 * 4);
    const perPath = paths.map((p, pi) => {
      const n = p.data.length / p.stride;
      const r = new Float32Array(n);
      const q0 = new Uint8Array(n);
      const q1 = new Uint8Array(n);
      const f = new Float32Array(n);
      const frac = new Float32Array(n);
      const seg = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const o = i * p.stride;
        const d = p.data;
        for (let row = 0; row < 3; row++) {
          const base = ((pi * 3 + row) * maxPts + i) * 4;
          const src =
            row === 0
              ? [d[o]!, d[o + 1]!, d[o + 2]!, d[o + 3]!]
              : row === 1
                ? d.slice(o + 8, o + 12)
                : d.slice(o + 12, o + 16);
          tex.set(src, base);
        }
        r[i] = d[o + 3]!;
        q0[i] = d[o + 4]!;
        q1[i] = d[o + 5]!;
        f[i] = d[o + 6]!;
        frac[i] = d[o + 7]!;
        if (i < n - 1) {
          const o2 = o + p.stride;
          seg[i] = Math.max(Math.hypot(d[o2]! - d[o]!, d[o2 + 1]! - d[o + 1]!, d[o2 + 2]! - d[o + 2]!), 0.02);
        } else seg[i] = seg[i - 1] ?? 0.2;
      }
      return { n, r, q0, q1, f, frac, seg, side: p.side };
    });
    const texture = new DataTexture(tex, maxPts, paths.length * 3, RGBAFormat, FloatType);
    texture.minFilter = texture.magFilter = NearestFilter;
    texture.needsUpdate = true;
    return { texture, perPath };
  }, [paths]);

  const geo = useMemo(() => {
    const count = COUNT[quality];
    const total = paths.reduce((a, p) => a + p.volume, 0);
    const aPath = new Float32Array(count);
    const aS = new Float32Array(count);
    const aRand = new Float32Array(count * 3);
    const aVel = new Float32Array(count);
    const aSide = new Float32Array(count);
    let k = 0;
    paths.forEach((p, pi) => {
      const m = pi === paths.length - 1 ? count - k : Math.round((count * p.volume) / total);
      for (let j = 0; j < m && k < count; j++, k++) {
        aPath[k] = pi;
        aS[k] = Math.random() * (data.perPath[pi]!.n - 1.001);
        aRand.set([Math.random(), Math.random(), Math.random()], k * 3);
        aSide[k] = p.side;
      }
    });
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(count * 3), 3));
    g.setAttribute('aPath', new BufferAttribute(aPath, 1));
    g.setAttribute('aS', new BufferAttribute(aS, 1));
    g.setAttribute('aRand', new BufferAttribute(aRand, 3));
    g.setAttribute('aVel', new BufferAttribute(aVel, 1));
    g.setAttribute('aSide', new BufferAttribute(aSide, 1));
    g.setDrawRange(0, count);
    return g;
  }, [paths, quality, data]);

  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: NormalBlending,
        clipping: true,
        uniforms: {
          ...uniforms,
          uPaths: { value: data.texture },
          uPixelRatio: { value: gl.getPixelRatio() },
          uSize: { value: 1.6 },
          uTime: { value: 0 },
          uDoppler: { value: 0 },
          uSvO2: { value: 0.7 },
          uSaO2: { value: 0.98 },
        },
      }),
    [uniforms, data, gl],
  );
  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => () => geo.dispose(), [geo]);
  useEffect(() => () => data.texture.dispose(), [data]);
  useEffect(() => {
    material.clippingPlanes = clip ? [clip] : null;
    material.needsUpdate = true;
  }, [clip, material]);

  const last = useRef(-1);
  const flows = useMemo(() => new Float64Array(8), []);
  useFrame(() => {
    if (sampleBuffer.head === 0) return;
    const t = sampleBuffer.latest(F.t);
    const dt = last.current < 0 ? 0 : Math.min(Math.max(t - last.current, 0), 0.05);
    last.current = t;
    for (let i = 0; i < 8; i++) flows[i] = sampleBuffer.latest(FLOWS[i]!);
    const aS = geo.getAttribute('aS') as BufferAttribute;
    const aVel = geo.getAttribute('aVel') as BufferAttribute;
    const aPath = geo.getAttribute('aPath') as BufferAttribute;
    const S = aS.array as Float32Array;
    const V = aVel.array as Float32Array;
    const P = aPath.array as Float32Array;
    for (let k = 0; k < S.length; k++) {
      const pp = data.perPath[P[k]!]!;
      let s = S[k]!;
      const i = Math.min(Math.floor(s), pp.n - 2);
      const q = (flows[pp.q0[i]!]! * (1 - pp.f[i]!) + flows[pp.q1[i]!]! * pp.f[i]!) * pp.frac[i]!;
      const r = pp.r[i]!;
      const v = q / (Math.PI * r * r); // cm/s
      s += (v * dt) / pp.seg[i]!;
      if (s >= pp.n - 1.001) s = Math.random() * 3;
      else if (s < 0) s = pp.n - 1.5 - Math.random() * 2;
      S[k] = s;
      V[k] = v;
    }
    aS.needsUpdate = true;
    aVel.needsUpdate = true;
    const u = material.uniforms;
    u.uTime!.value = t;
    u.uDoppler!.value = colorMode === 'doppler' ? 1 : 0;
    const beat = useSimulation.getState().beat;
    if (beat) u.uSvO2!.value = beat.svo2;
    u.uSaO2!.value = useSimulation.getState().params.oxygen.sao2;
  });

  if (!enabled) return null;
  return <points ref={pointsRef} geometry={geo} material={material} renderOrder={4} frustumCulled={false} />;
}
