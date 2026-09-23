import {
  AlwaysStencilFunc,
  BackSide,
  Color,
  DecrementWrapStencilOp,
  DoubleSide,
  FrontSide,
  IncrementWrapStencilOp,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  Vector2,
  Vector3,
  Vector4,
  type Material,
  type Plane,
  type WebGLProgramParametersWithUniforms,
} from 'three';
import { LA_ELLIPSOID, LONG_AXIS, LV_APEX, RA_ELLIPSOID, RV_APEX } from './anatomy';
import { injectDeformation, MAX_LEAFLETS, type DeformUniforms } from './deformGlsl';
import type { DeformState } from './deformation';
import { SIMPLEX_3D } from './shaderNoise';

/** Riferimenti geometrici per la deformazione (cm, sistema della scena). */
export interface HeartFrame {
  longAxis: readonly number[];
  lvApex: readonly number[];
  rvApex: readonly number[];
  laCenter: readonly number[];
  raCenter: readonly number[];
  /** Distanza base–apice (cm) */
  baseApexLength: number;
  leaflets?: { valve: number; point: number[]; axis: number[] }[];
}

export const PROCEDURAL_FRAME: HeartFrame = {
  longAxis: LONG_AXIS,
  lvApex: LV_APEX,
  rvApex: RV_APEX,
  laCenter: LA_ELLIPSOID.c,
  raCenter: RA_ELLIPSOID.c,
  baseApexLength: 9,
};

/** Uniform condivise tra tutti i materiali di un cuore. */
export interface HeartUniforms extends DeformUniforms {
  /** 0 = nessun dettaglio procedurale (qualità bassa), 1 = pieno */
  uDetail: { value: number };
  /** 0 anatomico, 1 heatmap di pressione, 2 attivazione elettrica */
  uMode: { value: number };
  /** Pressioni istantanee VS, VD, AS, AD (mmHg) */
  uPressure: { value: Vector4 };
  /** Attivazione ventricolare e atriale (0–1) */
  uActivation: { value: Vector2 };
  /** Opacità della vista a raggi X */
  uXray: { value: number };
}

/** Uniform condivisa: livello di dettaglio procedurale (impostato dalla qualità grafica). */
export const DETAIL = { value: 1 };

const v3 = (a: readonly number[]) => new Vector3(a[0], a[1], a[2]);

export function createHeartUniforms(frame: HeartFrame = PROCEDURAL_FRAME): HeartUniforms {
  const hp: Vector3[] = [];
  const ha: Vector3[] = [];
  for (let i = 0; i < MAX_LEAFLETS; i++) {
    const l = frame.leaflets?.[i];
    hp.push(l ? v3(l.point) : new Vector3());
    ha.push(l ? v3(l.axis).normalize() : new Vector3(0, 1, 0));
  }
  return {
    uAxis: { value: v3(frame.longAxis).normalize() },
    uLvApex: { value: v3(frame.lvApex) },
    uRvApex: { value: v3(frame.rvApex) },
    uLaCenter: { value: v3(frame.laCenter) },
    uRaCenter: { value: v3(frame.raCenter) },
    uVent: { value: new Vector4(1, 1, 1, 1) },
    uAtria: { value: new Vector2(1, 1) },
    uVessels: { value: new Vector2(1, 1) },
    uTwist: { value: 0 },
    uBaseApex: { value: frame.baseApexLength },
    uHingeP: { value: hp },
    uHingeA: { value: ha },
    uLeafAngle: { value: new Array<number>(MAX_LEAFLETS).fill(0) },
    uDetail: DETAIL,
    uMode: { value: 0 },
    uPressure: { value: new Vector4() },
    uActivation: { value: new Vector2() },
    uXray: { value: 0 },
  };
}

/**
 * Dettaglio di superficie nel fragment shader (coordinate del tessuto non deformato, così la trama
 * segue il battito):
 * - miocardio: striature lungo le fibre epicardiche (elica ~ −60°), chiazzature, vasellini subepicardici
 * - grasso epicardico: lobuli con rilievo, colore variabile, superficie più lucida
 * - endocardio: trabecolature; lembi valvolari: tessuto fibroso chiaro
 * - diffusione sottocutanea approssimata: bordo traslucido rossastro
 * - modalità didattiche: heatmap di pressione (endocardio) e attivazione elettrica (epicardio)
 */
const FRAGMENT_PARS = /* glsl */ `
varying vec3 vObjPos;
varying vec3 vObjNormal;
varying vec2 vSurface;
varying vec4 vChamber;
uniform vec3 uAxis;
uniform float uDetail;
uniform float uMode;
uniform vec4 uPressure;
uniform vec2 uActivation;
uniform float uXray;
${SIMPLEX_3D}
vec3 cs_perturb(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection) {
  vec3 vSigmaX = normalize(dFdx(surf_pos));
  vec3 vSigmaY = normalize(dFdy(surf_pos));
  vec3 vN = surf_norm;
  vec3 R1 = cross(vSigmaY, vN);
  vec3 R2 = cross(vN, vSigmaX);
  float fDet = dot(vSigmaX, R1) * faceDirection;
  vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2);
  return normalize(abs(fDet) * surf_norm - vGrad);
}
// Mappa di colore "turbo" (Google, approssimazione polinomiale)
vec3 cs_turbo(float x) {
  x = clamp(x, 0.0, 1.0);
  vec4 kR = vec4(0.13572138, 4.61539260, -42.66032258, 132.13108234);
  vec2 kR2 = vec2(-152.94239396, 59.28637943);
  vec4 kG = vec4(0.09140261, 2.19418839, 4.84296658, -14.18503333);
  vec2 kG2 = vec2(4.27729857, 2.82956604);
  vec4 kB = vec4(0.10667330, 12.64194608, -60.58204836, 110.36276771);
  vec2 kB2 = vec2(-89.90310912, 27.34824973);
  vec4 v4 = vec4(1.0, x, x * x, x * x * x);
  vec2 v2 = v4.zw * v4.z;
  return vec3(dot(v4, kR) + dot(v2, kR2), dot(v4, kG) + dot(v2, kG2), dot(v4, kB) + dot(v2, kB2));
}
`;

const VARYINGS_VS = /* glsl */ `
varying vec3 vObjPos;
varying vec3 vObjNormal;
varying vec2 vSurface;
varying vec4 vChamber;
`;

const COLOR_FRAGMENT = /* glsl */ `
#include <color_fragment>
float csH = 0.0; float csMottle = 0.0; float csFat = vSurface.x; float csKind = floor(vSurface.y + 0.5);
if (uDetail > 0.5) {
  vec3 p = vObjPos;
  vec3 n = normalize(vObjNormal);
  csMottle = snoise(p * 0.8) * 0.6 + snoise(p * 2.1 + 7.3) * 0.4;
  if (csKind < 1.5) {
    vec3 circ = normalize(cross(uAxis, n) + 1e-4);
    vec3 longi = cross(n, circ);
    vec3 fib = normalize(cos(-1.05) * circ + sin(-1.05) * longi);
    vec3 across = cross(n, fib);
    float streak = snoise(vec3(dot(p, fib) * 0.7, dot(p, across) * 9.0, dot(p, n) * 2.0));
    float streak2 = snoise(vec3(dot(p, fib) * 1.4, dot(p, across) * 18.0, 5.0));
    float vein = 1.0 - abs(snoise(p * 1.35 + vec3(3.1, -2.7, 1.9)));
    vein = pow(vein, 26.0) * (1.0 - csFat) * (csKind < 0.5 ? 1.0 : 0.4);
    csH = 0.3 * streak + 0.1 * streak2 - 0.5 * vein;
    diffuseColor.rgb *= 1.0 + 0.12 * csMottle + 0.04 * streak;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.25, 0.03, 0.05), clamp(vein, 0.0, 1.0) * 0.45);
  } else if (csKind < 2.5) {
    csH = 0.12 * snoise(p * 3.0);
    diffuseColor.rgb *= 1.0 + 0.08 * csMottle;
  } else if (csKind > 4.5 && csKind < 9.5) {
    // Endocardio e papillari: trabecolature carnee orientate lungo l'asse
    vec3 longi = normalize(uAxis - n * dot(uAxis, n) + 1e-4);
    vec3 across = cross(n, longi);
    float trab = snoise(vec3(dot(p, longi) * 1.2, dot(p, across) * 5.5, 0.0));
    csH = 0.6 * trab;
    diffuseColor.rgb *= 0.9 + 0.2 * trab;
  } else if (csKind > 9.5) {
    // Lembi valvolari: tessuto fibroso con venature sottili
    float fib = snoise(p * 6.0);
    diffuseColor.rgb *= 0.92 + 0.12 * fib;
    csH = 0.2 * fib;
  }
  if (csFat > 0.02) {
    float lob = snoise(p * 2.6);
    float lob2 = snoise(p * 5.0 + 2.0);
    float cells = 1.0 - pow(abs(lob), 0.6);
    csH = mix(csH, 0.8 * cells + 0.15 * lob2, csFat);
    vec3 fatCol = mix(vec3(0.78, 0.55, 0.16), vec3(0.93, 0.78, 0.40), 0.5 + 0.5 * lob2);
    diffuseColor.rgb = mix(diffuseColor.rgb, fatCol, csFat * 0.55 * (0.7 + 0.3 * cells));
  }
}
if (uMode > 0.5 && uMode < 1.5 && csKind > 4.5 && csKind < 9.5) {
  // Heatmap di pressione sull'endocardio (0–140 mmHg)
  float pr = dot(vChamber, uPressure) / max(vChamber.x + vChamber.y + vChamber.z + vChamber.w, 1e-3);
  diffuseColor.rgb = cs_turbo(pr / 140.0);
}
if (uMode > 1.5 && csKind < 1.5) {
  // Attivazione elettrica: ventricoli e atri si illuminano con e(t)
  float wv = vChamber.x + vChamber.y;
  float wa = vChamber.z + vChamber.w;
  float act = clamp(wv * uActivation.x + wa * uActivation.y, 0.0, 1.0);
  diffuseColor.rgb = mix(diffuseColor.rgb * 0.45, vec3(1.0, 0.85, 0.35), act * 0.85);
}
`;

const NORMAL_FRAGMENT = /* glsl */ `
#include <normal_fragment_maps>
if (uDetail > 0.5) {
  float bumpScale = csKind > 2.5 && csKind < 4.5 ? 0.0 : (csKind > 4.5 ? 0.03 : 0.018 + 0.03 * csFat);
  vec2 dH = vec2(dFdx(csH), dFdy(csH)) * bumpScale * 20.0;
  normal = cs_perturb(-vViewPosition, normal, dH, faceDirection);
}
`;

const EMISSIVE_FRAGMENT = /* glsl */ `
#include <emissivemap_fragment>
{
  vec3 V = normalize(vViewPosition);
  float rim = pow(1.0 - clamp(abs(dot(normal, V)), 0.0, 1.0), 2.6);
  vec3 sss = mix(vec3(0.55, 0.05, 0.03), vec3(0.6, 0.35, 0.08), csFat);
  totalEmissiveRadiance += sss * rim * 0.22 * (csKind > 1.5 && csKind < 2.5 ? 0.4 : 1.0);
  if (uMode > 1.5 && csKind < 1.5) {
    float act = clamp((vChamber.x + vChamber.y) * uActivation.x + (vChamber.z + vChamber.w) * uActivation.y, 0.0, 1.0);
    totalEmissiveRadiance += vec3(0.9, 0.55, 0.1) * act * 0.6;
  }
}
`;

const XRAY_OUTPUT = /* glsl */ `
#include <opaque_fragment>
if (uXray > 0.0) {
  vec3 V = normalize(vViewPosition);
  float fres = pow(1.0 - clamp(abs(dot(normal, V)), 0.0, 1.0), 1.8);
  gl_FragColor.a = mix(0.04, 0.55, fres) * uXray;
  gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.9, 0.6, 0.55), 0.35 * fres);
}
`;

export type SurfaceKind = 'exterior' | 'endocardium' | 'papillary' | 'valve';

/** Materiale fisico di una superficie del cuore con deformazione e dettaglio procedurale. */
export function createSurfaceMaterial(
  kind: SurfaceKind,
  uniforms: HeartUniforms,
  xray = false,
): MeshPhysicalMaterial {
  const base: Record<SurfaceKind, ConstructorParameters<typeof MeshPhysicalMaterial>[0]> = {
    exterior: {
      roughness: 0.55,
      clearcoat: 0.6,
      clearcoatRoughness: 0.32,
      sheen: 0.5,
      sheenRoughness: 0.6,
      sheenColor: new Color('#ff4636'),
      specularIntensity: 0.4,
    },
    endocardium: {
      roughness: 0.35,
      clearcoat: 0.9,
      clearcoatRoughness: 0.18,
      sheen: 0.4,
      sheenColor: new Color('#ff5a4a'),
      side: DoubleSide,
    },
    papillary: { roughness: 0.45, clearcoat: 0.7, clearcoatRoughness: 0.25, side: DoubleSide },
    valve: {
      roughness: 0.5,
      clearcoat: 0.5,
      sheen: 0.8,
      sheenColor: new Color('#fff0dd'),
      side: DoubleSide,
    },
  };
  const material = new MeshPhysicalMaterial({ vertexColors: true, metalness: 0, ior: 1.4, ...base[kind] });
  if (xray) {
    material.transparent = true;
    material.depthWrite = false;
    material.side = FrontSide;
  }
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = injectDeformation(shader.vertexShader, true)
      .replace('#include <common>', `#include <common>\n${VARYINGS_VS}`)
      .replace(
        'vec3 transformed = csPos;',
        'vec3 transformed = csPos;\n  vObjPos = position;\n  vObjNormal = normal;\n  vSurface = aSurface;\n  vChamber = aChamber;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAGMENT_PARS}`)
      .replace('#include <color_fragment>', COLOR_FRAGMENT)
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
roughnessFactor = clamp(roughnessFactor - 0.2 * csFat + 0.06 * csMottle - (csKind > 2.5 && csKind < 4.5 ? 0.15 : 0.0), 0.12, 1.0);`,
      )
      .replace('#include <normal_fragment_maps>', NORMAL_FRAGMENT)
      .replace('#include <emissivemap_fragment>', EMISSIVE_FRAGMENT)
      .replace('#include <opaque_fragment>', xray ? XRAY_OUTPUT : '#include <opaque_fragment>');
  };
  material.customProgramCacheKey = () => `heart-${kind}-${xray ? 'x' : 'o'}-v3`;
  return material;
}

/** Compatibilità: materiale epicardico + uniform (usato dal cuore procedurale). */
export function createHeartMaterial(frame: HeartFrame = PROCEDURAL_FRAME): {
  material: MeshPhysicalMaterial;
  uniforms: HeartUniforms;
} {
  const uniforms = createHeartUniforms(frame);
  return { material: createSurfaceMaterial('exterior', uniforms), uniforms };
}

/**
 * Materiali per il "capping" delle sezioni con lo stencil buffer: le facce posteriori incrementano,
 * quelle anteriori decrementano; dove il contatore è ≠ 0 il piano di taglio attraversa tessuto solido.
 */
export function createStencilMaterials(
  uniforms: HeartUniforms,
  plane: Plane,
  inverted = false,
): [Material, Material] {
  const make = (
    side: typeof FrontSide | typeof BackSide,
    op: typeof IncrementWrapStencilOp | typeof DecrementWrapStencilOp,
  ) => {
    const m = new MeshBasicMaterial({
      depthWrite: false,
      depthTest: false,
      colorWrite: false,
      stencilWrite: true,
      stencilFunc: AlwaysStencilFunc,
      side,
      clippingPlanes: [plane],
      stencilFail: op,
      stencilZFail: op,
      stencilZPass: op,
    });
    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = injectDeformation(shader.vertexShader, false);
    };
    m.customProgramCacheKey = () => `heart-stencil-${side}`;
    return m;
  };
  // Le cavità sono "buchi" nel solido: contano con segno opposto
  return inverted
    ? [make(BackSide, DecrementWrapStencilOp), make(FrontSide, IncrementWrapStencilOp)]
    : [make(BackSide, IncrementWrapStencilOp), make(FrontSide, DecrementWrapStencilOp)];
}

/** Aggiorna le uniform di deformazione dallo stato calcolato. */
export function applyDeform(u: HeartUniforms, d: DeformState): void {
  u.uVent.value.set(d.lvRad, d.lvAx, d.rvRad, d.rvAx);
  u.uAtria.value.set(d.la, d.ra);
  u.uVessels.value.set(d.ao, d.pa);
  u.uTwist.value = d.twist;
}
