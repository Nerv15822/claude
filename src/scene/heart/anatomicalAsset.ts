/**
 * Caricamento del modello anatomico precalcolato da BodyParts3D (scripts/build-anatomy.ts):
 * json con metadati + binario quantizzato → BufferGeometry con gli attributi di deformazione.
 */
import { BufferAttribute, BufferGeometry, Sphere, Vector3 } from 'three';
import type { Volumes } from './deformation';
import type { HeartFrame } from './heartMaterial';

export const ASSET_BASE = `${import.meta.env.BASE_URL}models/heart-bp3d`;

export interface AnatomyMeta extends HeartFrame {
  source: string;
  vertexCount: number;
  indexCount: number;
  refVolume: Volumes;
  bboxMin: [number, number, number];
  bboxMax: [number, number, number];
  wideIndex: boolean;
  layout: { name: string; offset: number; bytes: number }[];
}

export interface AnatomyAsset {
  meta: AnatomyMeta;
  geometry: BufferGeometry;
}

const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

export async function loadAnatomy(): Promise<AnatomyAsset> {
  const [metaRes, binRes] = await Promise.all([fetch(`${ASSET_BASE}.json`), fetch(`${ASSET_BASE}.bin`)]);
  if (!metaRes.ok || !binRes.ok) throw new Error('Modello anatomico non disponibile');
  const meta = (await metaRes.json()) as AnatomyMeta;
  const buf = await binRes.arrayBuffer();
  const part = (name: string) => {
    const l = meta.layout.find((x) => x.name === name);
    if (!l) throw new Error(`Attributo mancante: ${name}`);
    return { offset: l.offset, bytes: l.bytes };
  };
  const n = meta.vertexCount;
  const deq16 = (name: string) => {
    const { offset } = part(name);
    const src = new Uint16Array(buf, offset, n * 3);
    const out = new Float32Array(n * 3);
    for (let i = 0; i < out.length; i++) {
      const k = i % 3;
      out[i] = meta.bboxMin[k]! + (src[i]! / 65535) * (meta.bboxMax[k]! - meta.bboxMin[k]!);
    }
    return out;
  };
  const u8 = (name: string, size: number) => new Uint8Array(buf, part(name).offset, n * size);

  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(deq16('position'), 3));
  const nrm = new Int8Array(buf, part('normal').offset, n * 3);
  g.setAttribute('normal', new BufferAttribute(nrm, 3, true));
  const colSrc = u8('color', 3);
  const col = new Float32Array(n * 3);
  for (let i = 0; i < col.length; i++) col[i] = srgbToLinear(colSrc[i]! / 255);
  g.setAttribute('color', new BufferAttribute(col, 3));
  g.setAttribute('aChamber', new BufferAttribute(u8('aChamber', 4), 4, true));
  g.setAttribute('aVessel', new BufferAttribute(u8('aVessel', 4), 4, true));
  g.setAttribute('aAxis', new BufferAttribute(deq16('aAxis'), 3));
  const surf = u8('aSurface', 2);
  const surface = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    surface[i * 2] = surf[i * 2]! / 255;
    surface[i * 2 + 1] = surf[i * 2 + 1]!;
  }
  g.setAttribute('aSurface', new BufferAttribute(surface, 2));
  const ip = part('index');
  g.setIndex(
    new BufferAttribute(
      meta.wideIndex
        ? new Uint32Array(buf, ip.offset, meta.indexCount)
        : new Uint16Array(buf, ip.offset, meta.indexCount),
      1,
    ),
  );
  const c = new Vector3(...meta.bboxMin).add(new Vector3(...meta.bboxMax)).multiplyScalar(0.5);
  g.boundingSphere = new Sphere(c, new Vector3(...meta.bboxMax).sub(c).length() * 1.2);
  return { meta, geometry: g };
}
