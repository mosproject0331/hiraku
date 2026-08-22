import * as THREE from 'three';
import type { Roof } from '@hiraku/core';

/**
 * 屋根の形をつくる。
 *
 * 古民家の姿は屋根で決まる。外から見た印象も、中の天井の高さも、
 * どこに光が落ちるかも、屋根の勾配と軒の出で変わる。
 *
 * 平面が複雑でも、屋根は外周の矩形に架けたものとして組む。
 * 本当の隅木の納まりは図面から自動では出ないので、
 * ここで出すのは「そのくらいの高さと勾配で載る」という当たりまで。
 */

export interface RoofBox {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** 軒先の高さ(m)。壁の天端 */
  eaveY: number;
}

export interface RoofBuild {
  /** 屋根面。三角形の集まり */
  geometry: THREE.BufferGeometry;
  /** 妻壁など、屋根の下にできる壁面 */
  gableGeometry: THREE.BufferGeometry | null;
  /** 棟の高さ(m) */
  ridgeY: number;
  /** 軒先の高さ(m) */
  eaveY: number;
  /** 軒を含めた外形 */
  box: RoofBox;
}

/** 三角形を1枚積む */
function pushTri(
  pos: number[], nor: number[], uv: number[],
  a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3,
): void {
  const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
  for (const v of [a, b, c]) {
    pos.push(v.x, v.y, v.z);
    nor.push(n.x, n.y, n.z);
    // UVは水平投影。屋根材の目地が実寸で並ぶ
    uv.push(v.x, v.z);
  }
}

function pushQuad(
  pos: number[], nor: number[], uv: number[],
  a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3,
): void {
  pushTri(pos, nor, uv, a, b, c);
  pushTri(pos, nor, uv, a, c, d);
}

function finish(pos: number[], nor: number[], uv: number[]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeBoundingSphere();
  return g;
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** 建物の外周（軒を含まない）と壁天端から、屋根を組む */
export function buildRoof(
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number },
  wallTopY: number,
  roof: Roof,
): RoofBuild {
  const e = Math.max(0, roof.eaveMm) / 1000;
  const x0 = bounds.minX - e;
  const x1 = bounds.maxX + e;
  const z0 = bounds.minZ - e;
  const z1 = bounds.maxZ + e;
  const w = x1 - x0;
  const d = z1 - z0;
  const pitch = Math.max(0, roof.pitchSun) / 10;
  const eaveY = wallTopY + 0.12; // 桁の上に少し出る
  const box: RoofBox = { minX: x0, maxX: x1, minZ: z0, maxZ: z1, eaveY };

  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const gp: number[] = [];
  const gn: number[] = [];
  const gu: number[] = [];
  let ridgeY = eaveY;

  if (roof.shape === 'flat') {
    ridgeY = eaveY + 0.15;
    pushQuad(pos, nor, uv, V(x0, ridgeY, z0), V(x1, ridgeY, z0), V(x1, ridgeY, z1), V(x0, ridgeY, z1));
    // パラペット（立ち上がり）
    const p = ridgeY + 0.3;
    pushQuad(gp, gn, gu, V(x0, ridgeY, z0), V(x0, p, z0), V(x1, p, z0), V(x1, ridgeY, z0));
    pushQuad(gp, gn, gu, V(x1, ridgeY, z1), V(x1, p, z1), V(x0, p, z1), V(x0, ridgeY, z1));
    pushQuad(gp, gn, gu, V(x0, ridgeY, z1), V(x0, p, z1), V(x0, p, z0), V(x0, ridgeY, z0));
    pushQuad(gp, gn, gu, V(x1, ridgeY, z0), V(x1, p, z0), V(x1, p, z1), V(x1, ridgeY, z1));
  } else if (roof.shape === 'shed') {
    // 片流れ。棟の向きで、どちらへ流すかが決まる
    const alongX = roof.ridge === 'x';
    const rise = (alongX ? d : w) * pitch;
    ridgeY = eaveY + rise;
    if (alongX) {
      pushQuad(pos, nor, uv, V(x0, eaveY, z1), V(x1, eaveY, z1), V(x1, ridgeY, z0), V(x0, ridgeY, z0));
      pushTri(gp, gn, gu, V(x0, eaveY, z1), V(x0, ridgeY, z0), V(x0, eaveY, z0));
      pushTri(gp, gn, gu, V(x1, eaveY, z0), V(x1, ridgeY, z0), V(x1, eaveY, z1));
    } else {
      pushQuad(pos, nor, uv, V(x1, eaveY, z0), V(x1, eaveY, z1), V(x0, ridgeY, z1), V(x0, ridgeY, z0));
      pushTri(gp, gn, gu, V(x1, eaveY, z0), V(x0, ridgeY, z0), V(x0, eaveY, z0));
      pushTri(gp, gn, gu, V(x0, eaveY, z1), V(x0, ridgeY, z1), V(x1, eaveY, z1));
    }
  } else if (roof.shape === 'gable') {
    const alongX = roof.ridge === 'x';
    const half = (alongX ? d : w) / 2;
    ridgeY = eaveY + half * pitch;
    if (alongX) {
      const zc = (z0 + z1) / 2;
      pushQuad(pos, nor, uv, V(x0, eaveY, z0), V(x0, ridgeY, zc), V(x1, ridgeY, zc), V(x1, eaveY, z0));
      pushQuad(pos, nor, uv, V(x1, eaveY, z1), V(x1, ridgeY, zc), V(x0, ridgeY, zc), V(x0, eaveY, z1));
      // 妻壁
      pushTri(gp, gn, gu, V(x0, eaveY, z0), V(x0, eaveY, z1), V(x0, ridgeY, zc));
      pushTri(gp, gn, gu, V(x1, eaveY, z1), V(x1, eaveY, z0), V(x1, ridgeY, zc));
    } else {
      const xc = (x0 + x1) / 2;
      pushQuad(pos, nor, uv, V(x0, eaveY, z1), V(xc, ridgeY, z1), V(xc, ridgeY, z0), V(x0, eaveY, z0));
      pushQuad(pos, nor, uv, V(x1, eaveY, z0), V(xc, ridgeY, z0), V(xc, ridgeY, z1), V(x1, eaveY, z1));
      pushTri(gp, gn, gu, V(x0, eaveY, z0), V(x1, eaveY, z0), V(xc, ridgeY, z0));
      pushTri(gp, gn, gu, V(x1, eaveY, z1), V(x0, eaveY, z1), V(xc, ridgeY, z1));
    }
  } else {
    // 寄棟。短い辺の半分だけ棟が縮む
    const alongX = w >= d;
    const half = (alongX ? d : w) / 2;
    ridgeY = eaveY + half * pitch;
    if (alongX) {
      const zc = (z0 + z1) / 2;
      const rx0 = x0 + half;
      const rx1 = x1 - half;
      pushQuad(pos, nor, uv, V(x0, eaveY, z0), V(rx0, ridgeY, zc), V(rx1, ridgeY, zc), V(x1, eaveY, z0));
      pushQuad(pos, nor, uv, V(x1, eaveY, z1), V(rx1, ridgeY, zc), V(rx0, ridgeY, zc), V(x0, eaveY, z1));
      pushTri(pos, nor, uv, V(x0, eaveY, z0), V(x0, eaveY, z1), V(rx0, ridgeY, zc));
      pushTri(pos, nor, uv, V(x1, eaveY, z1), V(x1, eaveY, z0), V(rx1, ridgeY, zc));
    } else {
      const xc = (x0 + x1) / 2;
      const rz0 = z0 + half;
      const rz1 = z1 - half;
      pushQuad(pos, nor, uv, V(x0, eaveY, z1), V(xc, ridgeY, rz1), V(xc, ridgeY, rz0), V(x0, eaveY, z0));
      pushQuad(pos, nor, uv, V(x1, eaveY, z0), V(xc, ridgeY, rz0), V(xc, ridgeY, rz1), V(x1, eaveY, z1));
      pushTri(pos, nor, uv, V(x0, eaveY, z0), V(x1, eaveY, z0), V(xc, ridgeY, rz0));
      pushTri(pos, nor, uv, V(x1, eaveY, z1), V(x0, eaveY, z1), V(xc, ridgeY, rz1));
    }
  }

  return {
    geometry: finish(pos, nor, uv),
    gableGeometry: gp.length ? finish(gp, gn, gu) : null,
    ridgeY,
    eaveY,
    box,
  };
}

/**
 * その位置での、屋根の裏（天井）の高さ。
 * 小屋裏を見せるときの勾配天井に使う。
 */
export function ceilingHeightAt(x: number, z: number, r: RoofBuild, roof: Roof): number {
  const { box } = r;
  const pitch = Math.max(0, roof.pitchSun) / 10;
  const thickness = 0.16; // 屋根の厚み（垂木＋野地）
  if (roof.shape === 'flat') return r.ridgeY - thickness;
  if (roof.shape === 'shed') {
    const alongX = roof.ridge === 'x';
    const t = alongX
      ? (box.maxZ - z) / (box.maxZ - box.minZ)
      : (box.maxX - x) / (box.maxX - box.minX);
    return r.eaveY + (r.ridgeY - r.eaveY) * Math.max(0, Math.min(1, t)) - thickness;
  }
  const alongX = roof.shape === 'hip' ? box.maxX - box.minX >= box.maxZ - box.minZ : roof.ridge === 'x';
  const dist = alongX
    ? Math.min(z - box.minZ, box.maxZ - z)
    : Math.min(x - box.minX, box.maxX - x);
  let h = r.eaveY + Math.max(0, dist) * pitch;
  if (roof.shape === 'hip') {
    const d2 = alongX
      ? Math.min(x - box.minX, box.maxX - x)
      : Math.min(z - box.minZ, box.maxZ - z);
    h = Math.min(h, r.eaveY + Math.max(0, d2) * pitch);
  }
  return Math.min(r.ridgeY, h) - thickness;
}
