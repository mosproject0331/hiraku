import * as THREE from 'three';
import type { Finish } from '@hiraku/core';
import { materialMaps, setTextureSize } from './textures';

/**
 * 仕上げ材を three.js のマテリアルにする。
 * ジオメトリのUVを「メートル」で作ってあるので、繰り返しは実寸のまま置ける。
 * 同じ仕上げは同じマテリアルを共有し、描画の負荷を上げない。
 */

const cache = new Map<string, THREE.MeshStandardMaterial>();

/** 床の仕上げ。環境の映り込みを少し強くする */
const FLOORS = new Set(['flooring', 'as_is_floor', 'cushion_floor', 'doma', 'tatami_omote']);

const BUMP: Record<string, number> = {
  tatami_omote: 0.006,
  doma: 0.01,
  shikkui_diy: 0.008,
  flooring: 0.004,
  as_is_floor: 0.005,
  ceiling_board: 0.004,
};

/** 端末に合わせて素材の細かさを決める。変えると作り直しになる */
export function setFinishTextureSize(px: number): void {
  if (!setTextureSize(px)) return;
  for (const m of cache.values()) m.dispose();
  cache.clear();
}

export function finishMaterial(f: Finish): THREE.MeshStandardMaterial {
  const hit = cache.get(f.id);
  if (hit) return hit;

  const maps = materialMaps(f.id);
  const m = new THREE.MeshStandardMaterial({
    color: maps ? 0xffffff : new THREE.Color(f.color),
    roughness: f.roughness,
    metalness: 0,
    // 床は環境を少し映すと、平らな板ではなく「磨かれた床」に見える
    envMapIntensity: FLOORS.has(f.id) ? 1.5 : 1,
  });
  if (maps) {
    const r = maps.repeatPerMeter;
    for (const t of [maps.map, maps.roughnessMap, maps.bumpMap]) t.repeat.set(r, r);
    m.map = maps.map;
    m.roughnessMap = maps.roughnessMap;
    m.bumpMap = maps.bumpMap;
    m.bumpScale = BUMP[f.id] ?? 0.003;
  }
  cache.set(f.id, m);
  return m;
}

/**
 * BoxGeometry のUVを実寸(m)に直す。
 * 面ごとに実際の大きさが違うので、そのまま 0–1 で貼ると縮尺が揃わない。
 */
export function boxWorldUV(w: number, h: number, d: number): THREE.BoxGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  // BoxGeometry の面順は +x, -x, +y, -y, +z, -z。各面4頂点
  const scale: [number, number][] = [
    [d, h], [d, h], [w, d], [w, d], [w, h], [w, h],
  ];
  for (let face = 0; face < 6; face++) {
    const [su, sv] = scale[face]!;
    for (let i = 0; i < 4; i++) {
      const idx = face * 4 + i;
      uv.setXY(idx, uv.getX(idx) * su, uv.getY(idx) * sv);
    }
  }
  uv.needsUpdate = true;
  return g;
}

/** 床・天井の輪郭(mm)から、UVがメートルの平面をつくる */
export function slabGeometry(outline: { x: number; y: number }[], flip: boolean): THREE.ShapeGeometry {
  const s = new THREE.Shape();
  outline.forEach((p, i) => {
    const x = p.x / 1000;
    const y = (flip ? -p.y : p.y) / 1000;
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  });
  s.closePath();
  // ShapeGeometry のUVは頂点座標そのもの＝メートル単位になる
  return new THREE.ShapeGeometry(s);
}
