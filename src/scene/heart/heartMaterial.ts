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
}

const v3 = (a: readonly number[]) => new Vector3(a[0], a[1], a[2]);

export function createHeartMaterial(): { material: MeshPhysicalMaterial; uniforms: HeartUniforms } {
  const uniforms: HeartUniforms = {
    uAxis: { value: v3(LONG_AXIS) },
    uLvApex: { value: v3(LV_APEX) },
    uRvApex: { value: v3(RV_APEX) },
    uLaCenter: { value: v3(LA_ELLIPSOID.c) },
    uRaCenter: { value: v3(RA_ELLIPSOID.c) },
    uVent: { value: new Vector4(1, 1, 1, 1) },
    uAtria: { value: new Vector2(1, 1) },
    uVessels: { value: new Vector2(1, 1) },
    uTwist: { value: 0 },
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
uniform vec3 uAxis;
uniform vec3 uLvApex;
uniform vec3 uRvApex;
uniform vec3 uLaCenter;
uniform vec3 uRaCenter;
uniform vec4 uVent;
uniform vec2 uAtria;
uniform vec2 uVessels;
uniform float uTwist;

vec3 rotateAxis(vec3 v, vec3 k, float a) {
  float c = cos(a), s = sin(a);
  return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c);
}
// Ventricolo: scala assiale (ancorata all'apice) e radiale + torsione attorno all'asse lungo
vec3 ventricle(vec3 p, vec3 apex, float sRad, float sAx, float twist, inout vec3 n, float w) {
  vec3 q = p - apex;
  float a = dot(q, uAxis);
  vec3 r = q - a * uAxis;
  float t = clamp(-a / 9.0, 0.0, 1.0);        // 0 apice → 1 base
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
  vec3 descent = uAxis * 9.0 * (1.0 - uVent.y) * 0.5;
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
      .replace('void main() {', 'void main() {\n  vec3 deformedPosition = position;');
  };
  material.customProgramCacheKey = () => 'heart-deform-v1';
  return { material, uniforms };
}

export function applyDeform(u: HeartUniforms, d: DeformState): void {
  u.uVent.value.set(d.lvRad, d.lvAx, d.rvRad, d.rvAx);
  u.uAtria.value.set(d.la, d.ra);
  u.uVessels.value.set(d.ao, d.pa);
  u.uTwist.value = d.twist;
}
