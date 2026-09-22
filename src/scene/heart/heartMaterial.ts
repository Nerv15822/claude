import {
  Color,
  MeshPhysicalMaterial,
  Vector2,
  Vector3,
  Vector4,
  type WebGLProgramParametersWithUniforms,
} from 'three';
import { LA_ELLIPSOID, LONG_AXIS, LV_APEX, RA_ELLIPSOID, RV_APEX } from './anatomy';
import type { DeformState } from './deformation';
import { SIMPLEX_3D } from './shaderNoise';

/**
 * Materiale del miocardio: MeshPhysicalMaterial (clearcoat "umido", sheen per la diffusione
 * superficiale) con deformazione nel vertex shader guidata dai volumi delle camere.
 */
export interface HeartUniforms {
  uAxis: { value: Vector3 };
  uLvApex: { value: Vector3 };
  uRvApex: { value: Vector3 };
  uLaCenter: { value: Vector3 };
  uRaCenter: { value: Vector3 };
  uVent: { value: Vector4 };
  uAtria: { value: Vector2 };
  uVessels: { value: Vector2 };
  uTwist: { value: number };
  uBaseApex: { value: number };
  /** 0 = nessun dettaglio procedurale (qualità bassa), 1 = pieno */
  uDetail: { value: number };
}

/** Riferimenti geometrici per la deformazione (cm, sistema della scena). */
export interface HeartFrame {
  longAxis: readonly number[];
  lvApex: readonly number[];
  rvApex: readonly number[];
  laCenter: readonly number[];
  raCenter: readonly number[];
  /** Distanza base–apice (cm) */
  baseApexLength: number;
}

export const PROCEDURAL_FRAME: HeartFrame = {
  longAxis: LONG_AXIS,
  lvApex: LV_APEX,
  rvApex: RV_APEX,
  laCenter: LA_ELLIPSOID.c,
  raCenter: RA_ELLIPSOID.c,
  baseApexLength: 9,
};

const v3 = (a: readonly number[]) => new Vector3(a[0], a[1], a[2]);

/**
 * Dettaglio di superficie nel fragment shader (coordinate del tessuto non deformato, così la trama
 * segue il battito):
 * - miocardio: striature lungo la direzione delle fibre epicardiche (elica ~ −60° rispetto al piano
 *   circonferenziale), chiazzature e vasellini subepicardici
 * - grasso epicardico: lobuli con rilievo, colore variabile, superficie più lucida
 * - diffusione sottocutanea approssimata: luce di bordo rossastra (wrap/rim), attenuata sul grasso
 */
const FRAGMENT_PARS = /* glsl */ `
varying vec3 vObjPos;
varying vec3 vObjNormal;
varying vec2 vSurface;
uniform vec3 uAxis;
uniform float uDetail;
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
`;

/** Uniform condivisa: livello di dettaglio procedurale (impostato dalla qualità grafica). */
export const DETAIL = { value: 1 };

export function createHeartMaterial(frame: HeartFrame = PROCEDURAL_FRAME): {
  material: MeshPhysicalMaterial;
  uniforms: HeartUniforms;
} {
  const uniforms: HeartUniforms = {
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
    uDetail: DETAIL,
  };
  const material = new MeshPhysicalMaterial({
    vertexColors: true,
    roughness: 0.55,
    metalness: 0,
    clearcoat: 0.6,
    clearcoatRoughness: 0.32,
    sheen: 0.5,
    sheenRoughness: 0.6,
    sheenColor: new Color('#ff4636'),
    specularIntensity: 0.4,
    ior: 1.4,
  });
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute vec4 aChamber;
attribute vec4 aVessel;
attribute vec3 aAxis;
attribute vec2 aSurface;
varying vec3 vObjPos;
varying vec3 vObjNormal;
varying vec2 vSurface;
uniform vec3 uAxis;
uniform vec3 uLvApex;
uniform vec3 uRvApex;
uniform vec3 uLaCenter;
uniform vec3 uRaCenter;
uniform vec4 uVent;
uniform vec2 uAtria;
uniform vec2 uVessels;
uniform float uTwist;
uniform float uBaseApex;

vec3 rotateAxis(vec3 v, vec3 k, float a) {
  float c = cos(a), s = sin(a);
  return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c);
}
// Ventricolo: scala assiale (ancorata all'apice) e radiale + torsione attorno all'asse lungo
vec3 ventricle(vec3 p, vec3 apex, float sRad, float sAx, float twist, inout vec3 n, float w) {
  vec3 q = p - apex;
  float a = dot(q, uAxis);
  vec3 r = q - a * uAxis;
  float t = clamp(-a / uBaseApex, 0.0, 1.0);   // 0 apice → 1 base
  float ang = twist * (1.0 - 1.45 * t);         // apice antiorario, base orario
  vec3 np = apex + rotateAxis(a * sAx * uAxis + r * sRad, uAxis, ang);
  float na = dot(n, uAxis);
  vec3 nd = rotateAxis(normalize(na / sAx * uAxis + (n - na * uAxis) / sRad), uAxis, ang);
  n = normalize(mix(n, nd, w));
  return np;
}`,
      )
      .replace(
        '#include <beginnormal_vertex>',
        `vec3 objectNormal = vec3( normal );
vec3 deformedNormal = objectNormal;
{
  vec3 p = position;
  vec3 acc = vec3(0.0);
  float wsum = 0.0;
  float wl = aChamber.x, wr = aChamber.y;
  acc += wl * ventricle(p, uLvApex, uVent.x, uVent.y, uTwist, deformedNormal, wl);
  acc += wr * ventricle(p, uRvApex, uVent.z, uVent.w, uTwist * 0.6, deformedNormal, wr);
  // Atri: scala isotropa e discesa del piano valvolare trasmessa (metà dello spostamento della base)
  vec3 descent = uAxis * uBaseApex * (1.0 - uVent.y) * 0.5;
  acc += aChamber.z * (uLaCenter + (p - uLaCenter) * uAtria.x + descent);
  acc += aChamber.w * (uRaCenter + (p - uRaCenter) * uAtria.y + descent);
  // Vasi: distensione radiale attorno all'asse del vaso
  acc += aVessel.x * (aAxis + (p - aAxis) * uVessels.x);
  acc += aVessel.y * (aAxis + (p - aAxis) * uVessels.y);
  acc += (aVessel.z + aVessel.w) * (p + descent * 0.4);
  deformedPosition = acc;
  objectNormal = deformedNormal;
}`,
      )
      .replace('#include <begin_vertex>', 'vec3 transformed = deformedPosition;')
      .replace(
        'void main() {',
        'void main() {\n  vec3 deformedPosition = position;\n  vObjPos = position;\n  vObjNormal = normal;\n  vSurface = aSurface;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAGMENT_PARS}`)
      .replace(
        'void main() {',
        'void main() {\n  float csH = 0.0; float csMottle = 0.0; float csFat = vSurface.x; float csKind = floor(vSurface.y + 0.5);',
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
if (uDetail > 0.5) {
  vec3 p = vObjPos;
  vec3 n = normalize(vObjNormal);
  csMottle = snoise(p * 0.8) * 0.6 + snoise(p * 2.1 + 7.3) * 0.4;
  if (csKind < 1.5) {
    // Direzione delle fibre epicardiche: elica sinistrorsa ~ -60° rispetto alla circonferenza
    vec3 circ = normalize(cross(uAxis, n) + 1e-4);
    vec3 longi = cross(n, circ);
    vec3 fib = normalize(cos(-1.05) * circ + sin(-1.05) * longi);
    vec3 across = cross(n, fib);
    float streak = snoise(vec3(dot(p, fib) * 0.7, dot(p, across) * 9.0, dot(p, n) * 2.0));
    float streak2 = snoise(vec3(dot(p, fib) * 1.4, dot(p, across) * 18.0, 5.0));
    // Vasellini subepicardici: creste del rumore (linee sottili ramificate)
    float vein = 1.0 - abs(snoise(p * 1.35 + vec3(3.1, -2.7, 1.9)));
    vein = pow(vein, 26.0) * (1.0 - csFat) * (csKind < 0.5 ? 1.0 : 0.4);
    csH = 0.3 * streak + 0.1 * streak2 - 0.5 * vein;
    diffuseColor.rgb *= 1.0 + 0.12 * csMottle + 0.04 * streak;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.25, 0.03, 0.05), clamp(vein, 0.0, 1.0) * 0.45);
  } else if (csKind < 2.5) {
    // Parete dei grandi vasi: striature longitudinali leggere
    csH = 0.12 * snoise(p * 3.0);
    diffuseColor.rgb *= 1.0 + 0.08 * csMottle;
  }
  // Grasso epicardico: lobuli
  if (csFat > 0.02) {
    float lob = snoise(p * 2.6);
    float lob2 = snoise(p * 5.0 + 2.0);
    float cells = 1.0 - pow(abs(lob), 0.6);
    csH = mix(csH, 0.8 * cells + 0.15 * lob2, csFat);
    vec3 fatA = vec3(0.78, 0.55, 0.16);
    vec3 fatB = vec3(0.93, 0.78, 0.40);
    vec3 fatCol = mix(fatA, fatB, 0.5 + 0.5 * lob2);
    diffuseColor.rgb = mix(diffuseColor.rgb, fatCol, csFat * 0.55 * (0.7 + 0.3 * cells));
  }
}`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
roughnessFactor = clamp(roughnessFactor - 0.2 * csFat + 0.06 * csMottle - (csKind > 2.5 ? 0.15 : 0.0), 0.12, 1.0);`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
if (uDetail > 0.5) {
  float bumpScale = csKind > 2.5 ? 0.0 : 0.018 + 0.03 * csFat;
  vec2 dH = vec2(dFdx(csH), dFdy(csH)) * bumpScale * 20.0;
  normal = cs_perturb(-vViewPosition, normal, dH, faceDirection);
}`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
{
  // Diffusione sottocutanea approssimata: bordo traslucido rossastro
  vec3 V = normalize(vViewPosition);
  float rim = pow(1.0 - clamp(dot(normal, V), 0.0, 1.0), 2.6);
  vec3 sss = mix(vec3(0.55, 0.05, 0.03), vec3(0.6, 0.35, 0.08), csFat);
  totalEmissiveRadiance += sss * rim * 0.22 * (csKind > 1.5 && csKind < 2.5 ? 0.4 : 1.0);
}`,
      );
  };
  material.customProgramCacheKey = () => 'heart-deform-v2';
  return { material, uniforms };
}

export function applyDeform(u: HeartUniforms, d: DeformState): void {
  u.uVent.value.set(d.lvRad, d.lvAx, d.rvRad, d.rvAx);
  u.uAtria.value.set(d.la, d.ra);
  u.uVessels.value.set(d.ao, d.pa);
  u.uTwist.value = d.twist;
}
