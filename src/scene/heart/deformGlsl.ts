/**
 * GLSL condiviso: deformazione guidata dai volumi delle camere (vedi deformation.ts) e rotazione dei
 * lembi valvolari attorno alla cerniera. Usato da superfici, lembi, particelle e passaggi di stencil.
 */
import { Vector2, Vector3, Vector4 } from 'three';

export const MAX_LEAFLETS = 12;

export interface DeformUniforms {
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
  uHingeP: { value: Vector3[] };
  uHingeA: { value: Vector3[] };
  uLeafAngle: { value: number[] };
  /** Cavità: scale radiali VS/VD (x, z) e assiali (y, w, uguali all'epicardio) */
  uVentCav: { value: Vector4 };
  uAtriaCav: { value: Vector2 };
  /** Setto: centro (cm) e direzione VS→VD + spostamento (w, cm) */
  uSeptumC: { value: Vector3 };
  uSeptum: { value: Vector4 };
}

export const DEFORM_PARS = /* glsl */ `
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
uniform vec3 uHingeP[${MAX_LEAFLETS}];
uniform vec3 uHingeA[${MAX_LEAFLETS}];
uniform float uLeafAngle[${MAX_LEAFLETS}];
uniform vec4 uVentCav;
uniform vec2 uAtriaCav;
uniform vec3 uSeptumC;
uniform vec4 uSeptum;

vec3 csRotate(vec3 v, vec3 k, float a) {
  float c = cos(a), s = sin(a);
  return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c);
}
// Ventricolo: scala assiale (ancorata all'apice) e radiale + torsione attorno all'asse lungo
vec3 csVentricle(vec3 p, vec3 apex, float sRad, float sAx, float twist, inout vec3 n, float w) {
  vec3 q = p - apex;
  float a = dot(q, uAxis);
  vec3 r = q - a * uAxis;
  float t = clamp(-a / uBaseApex, 0.0, 1.0);
  float ang = twist * (1.0 - 1.45 * t);
  vec3 np = apex + csRotate(a * sAx * uAxis + r * sRad, uAxis, ang);
  float na = dot(n, uAxis);
  vec3 nd = csRotate(normalize(na / sAx * uAxis + (n - na * uAxis) / sRad), uAxis, ang);
  n = normalize(mix(n, nd, w));
  return np;
}
/** Deforma il punto p (e la normale n) secondo i pesi di regione. */
vec3 csDeform(vec3 p, inout vec3 n, vec4 ch, vec4 ve, vec3 ax) {
#ifdef CS_CAVITY
  vec4 vent = uVentCav;
  vec2 atria = uAtriaCav;
#else
  vec4 vent = uVent;
  vec2 atria = uAtria;
#endif
  vec3 acc = vec3(0.0);
  acc += ch.x * csVentricle(p, uLvApex, vent.x, vent.y, uTwist, n, ch.x);
  acc += ch.y * csVentricle(p, uRvApex, vent.z, vent.w, uTwist * 0.6, n, ch.y);
  vec3 descent = uAxis * uBaseApex * (1.0 - uVent.y) * 0.5;
  acc += ch.z * (uLaCenter + (p - uLaCenter) * atria.x + descent);
  acc += ch.w * (uRaCenter + (p - uRaCenter) * atria.y + descent);
#ifdef CS_CAVITY
  // Spostamento del setto interventricolare (interdipendenza, "D-shape"): campo gaussiano
  // anisotropo attorno alla superficie media del setto, applicato alle superfici endocardiche.
  vec3 sq = p - uSeptumC;
  float sa = dot(sq, uAxis);
  vec3 sr = sq - sa * uAxis;
  float sn = dot(sr, uSeptum.xyz);
  float st2 = dot(sr, sr) - sn * sn;
  float sg = exp(-sn * sn / 1.8 - st2 / 5.0) * (1.0 - smoothstep(0.25, 0.6, abs(sa) / uBaseApex));
  acc += (ch.x + ch.y) * uSeptum.xyz * (uSeptum.w * sg);
#endif
  acc += ve.x * (ax + (p - ax) * uVessels.x);
  acc += ve.y * (ax + (p - ax) * uVessels.y);
  acc += (ve.z + ve.w) * (p + descent * 0.4);
  float wsum = ch.x + ch.y + ch.z + ch.w + ve.x + ve.y + ve.z + ve.w;
  return acc + p * (1.0 - wsum);
}
/** Rotazione di un lembo valvolare attorno alla cerniera (t = 0 anulus → 1 margine libero). */
vec3 csLeaflet(vec3 p, inout vec3 n, vec2 leaf) {
  if (leaf.x < 0.5) return p;
  int i = int(leaf.x + 0.5) - 1;
  float ang = uLeafAngle[i] * leaf.y;
  vec3 h = uHingeP[i];
  vec3 k = uHingeA[i];
  n = csRotate(n, k, ang);
  return h + csRotate(p - h, k, ang);
}
`;

/** Vertex shader: dichiarazioni degli attributi usate da tutte le mesh del cuore. */
export const DEFORM_ATTRIBUTES = /* glsl */ `
attribute vec4 aChamber;
attribute vec4 aVessel;
attribute vec3 aAxis;
attribute vec2 aSurface;
attribute vec2 aLeaf;
`;

/** Sostituzioni nei chunk standard di three.js (MeshPhysical/Standard/Basic). */
export function injectDeformation(vertexShader: string, withNormal: boolean, cavity = false): string {
  let vs = vertexShader.replace(
    '#include <common>',
    `#include <common>\n${cavity ? '#define CS_CAVITY\n' : ''}${DEFORM_ATTRIBUTES}\n${DEFORM_PARS}`,
  );
  vs = vs.replace(
    'void main() {',
    `void main() {
  vec3 csNormal = normal;
  vec3 csPos = csLeaflet(position, csNormal, aLeaf);
  csPos = csDeform(csPos, csNormal, aChamber, aVessel, aAxis);`,
  );
  if (withNormal) vs = vs.replace('#include <beginnormal_vertex>', 'vec3 objectNormal = csNormal;');
  vs = vs.replace('#include <begin_vertex>', 'vec3 transformed = csPos;');
  return vs;
}
