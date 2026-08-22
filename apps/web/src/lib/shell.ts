import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { WaterUnit } from '@hiraku/core';
import type { Building, OpeningBuild, WallBuild } from './archviz';
import { boxWorldUV, finishMaterial, slabGeometry } from './finish-material';

/**
 * 建物の躯体・建具・設備を、実際の three.js の形にする。
 * 同じ材料の面はひとまとめにして描く。携帯でも描画の回数を抑えるため。
 */

export interface ShellOptions {
  /** ガラスの屈折を使うか（重いので端末を見て決める） */
  transmission: boolean;
}

interface Piece {
  geo: THREE.BufferGeometry;
  mat: THREE.Material;
  m: THREE.Matrix4;
}

const TRIM = {
  timber: new THREE.MeshStandardMaterial({ color: new THREE.Color('#6b4e35'), roughness: 0.62 }),
  timberDark: new THREE.MeshStandardMaterial({ color: new THREE.Color('#4a3524'), roughness: 0.6 }),
  sash: new THREE.MeshStandardMaterial({ color: new THREE.Color('#8f8b84'), roughness: 0.42, metalness: 0.55 }),
  door: new THREE.MeshStandardMaterial({ color: new THREE.Color('#7d6448'), roughness: 0.55 }),
  handle: new THREE.MeshStandardMaterial({ color: new THREE.Color('#b8a37a'), roughness: 0.3, metalness: 0.85 }),
  paperShoji: new THREE.MeshStandardMaterial({
    color: new THREE.Color('#f6f1e6'), roughness: 0.95,
    transparent: true, opacity: 0.86, side: THREE.DoubleSide,
  }),
  porcelain: new THREE.MeshStandardMaterial({ color: new THREE.Color('#f0f1f2'), roughness: 0.16 }),
  steel: new THREE.MeshStandardMaterial({ color: new THREE.Color('#4c5057'), roughness: 0.3, metalness: 0.8 }),
  cabinet: new THREE.MeshStandardMaterial({ color: new THREE.Color('#3e4650'), roughness: 0.5 }),
  worktop: new THREE.MeshStandardMaterial({ color: new THREE.Color('#c8c6c0'), roughness: 0.35, metalness: 0.15 }),
  water: new THREE.MeshStandardMaterial({
    color: new THREE.Color('#bcd6de'), roughness: 0.06, metalness: 0.1,
    transparent: true, opacity: 0.75,
  }),
};

function glassMaterial(transmission: boolean): THREE.Material {
  if (transmission) {
    return new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#ffffff'),
      roughness: 0.03, metalness: 0, transmission: 1, thickness: 0.006,
      ior: 1.5, transparent: true, opacity: 1, envMapIntensity: 1.4,
    });
  }
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#dceaf2'),
    roughness: 0.06, metalness: 0.05, transparent: true, opacity: 0.22,
    envMapIntensity: 2.2, side: THREE.DoubleSide,
  });
}

/** 面ひとつぶんの平面。UVはメートル */
function planeWorldUV(w: number, h: number): THREE.PlaneGeometry {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w, uv.getY(i) * h);
  uv.needsUpdate = true;
  return g;
}

function mat4(x: number, y: number, z: number, ry = 0, rx = 0): THREE.Matrix4 {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, 0, 'YXZ'));
  m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(1, 1, 1));
  return m;
}

/** 開口のうち、床に接しているもの（幅木を切る場所） */
function floorGaps(w: WallBuild): [number, number][] {
  return w.openings
    .filter((o) => o.sill < 0.06)
    .map((o) => [o.cx - o.width / 2 + w.len / 2, o.cx + o.width / 2 + w.len / 2] as [number, number]);
}

/** [0,len] から gaps を引いた残りの区間 */
function runsOutside(len: number, gaps: [number, number][]): [number, number][] {
  const sorted = [...gaps].sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  let c = 0;
  for (const [a, b] of sorted) {
    if (a > c) out.push([c, Math.min(a, len)]);
    c = Math.max(c, b);
  }
  if (c < len) out.push([c, len]);
  return out.filter(([a, b]) => b - a > 0.05);
}

export interface Shell {
  group: THREE.Group;
  dispose: () => void;
}

export function buildShell(b: Building, opts: ShellOptions): Shell {
  const pieces: Piece[] = [];
  const owned: THREE.Material[] = [];
  const glass = glassMaterial(opts.transmission);
  owned.push(glass);
  const push = (geo: THREE.BufferGeometry, mat: THREE.Material, m: THREE.Matrix4) => pieces.push({ geo, mat, m });

  const H = b.height;

  // ---- 床と天井 ----
  for (const r of b.rooms) {
    if (r.outline.length < 3) continue;
    push(slabGeometry(r.outline, true), finishMaterial(r.floor), mat4(0, 0.002, 0, 0, -Math.PI / 2));
    push(slabGeometry(r.outline, false), finishMaterial(r.ceiling), mat4(0, H - 0.002, 0, 0, Math.PI / 2));
  }

  // ---- 壁 ----
  for (const w of b.walls) {
    const base = mat4(w.cx, 0, w.cz, -w.angle);
    const mPlus = finishMaterial(w.finishPlus);
    const mMinus = finishMaterial(w.finishMinus);
    const th = w.thickness;

    for (const p of w.panels) {
      if (p.w <= 0.006 || p.h <= 0.006) continue;
      const local = mat4(p.off + p.w / 2 - w.len / 2, p.y + p.h / 2, 0);
      push(boxWorldUV(p.w, p.h, th), mPlus, base.clone().multiply(local));
      if (mMinus !== mPlus) {
        // 反対側の仕上げは薄い面として重ねる
        const skin = planeWorldUV(p.w, p.h);
        const lm = mat4(p.off + p.w / 2 - w.len / 2, p.y + p.h / 2, -th / 2 - 0.0015, Math.PI);
        push(skin, mMinus, base.clone().multiply(lm));
      }
    }

    // 幅木と廻り縁
    const runs = runsOutside(w.len, floorGaps(w));
    for (const [a, c] of runs) {
      const len = c - a;
      const cx = (a + c) / 2 - w.len / 2;
      for (const s of [1, -1]) {
        push(boxWorldUV(len, 0.062, 0.016), TRIM.timber,
          base.clone().multiply(mat4(cx, 0.031, s * (th / 2 + 0.008))));
      }
    }
    for (const s of [1, -1]) {
      push(boxWorldUV(w.len, 0.032, 0.014), TRIM.timber,
        base.clone().multiply(mat4(0, H - 0.016, s * (th / 2 + 0.007))));
    }

    // 建具
    for (const o of w.openings) buildOpening(push, base, w, o, glass, H);
  }

  // ---- 柱 ----
  for (const p of b.posts) {
    push(boxWorldUV(p.size, p.h, p.size), TRIM.timber, mat4(p.x, p.h / 2, p.z));
  }

  // ---- 梁 ----
  for (const bm of b.beams) {
    push(boxWorldUV(bm.len, bm.h, bm.w), TRIM.timberDark, mat4(bm.cx, bm.y, bm.cz, -bm.angle));
  }

  // ---- 水回り ----
  for (const r of b.rooms) {
    if (!r.waterUnits.length || r.outline.length < 3) continue;
    const cx = r.outline.reduce((s, p) => s + p.x, 0) / r.outline.length / 1000;
    const cz = r.outline.reduce((s, p) => s + p.y, 0) / r.outline.length / 1000;
    r.waterUnits.forEach((u, i) => buildWaterUnit(push, u, cx + (i - (r.waterUnits.length - 1) / 2) * 1.15, cz));
  }

  // ---- 同じ材料でまとめる ----
  const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
  for (const p of pieces) {
    const g = p.geo.index ? p.geo.toNonIndexed() : p.geo;
    if (g !== p.geo) p.geo.dispose();
    g.applyMatrix4(p.m);
    g.clearGroups();
    if (!g.attributes.uv) {
      const n = g.attributes.position!.count;
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    }
    const list = byMat.get(p.mat);
    if (list) list.push(g);
    else byMat.set(p.mat, [g]);
  }

  const group = new THREE.Group();
  const geos: THREE.BufferGeometry[] = [];
  for (const [mat, list] of byMat) {
    const merged = list.length === 1 ? list[0]! : mergeGeometries(list, false);
    if (!merged) continue;
    if (list.length > 1) list.forEach((g) => g.dispose());
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    geos.push(merged);
    group.add(mesh);
  }

  return {
    group,
    dispose: () => {
      geos.forEach((g) => g.dispose());
      owned.forEach((m) => m.dispose());
      group.clear();
    },
  };
}

type Push = (g: THREE.BufferGeometry, m: THREE.Material, mx: THREE.Matrix4) => void;

/** 窓・戸をつくる。枠 → 建具 → ガラス の順に重ねる */
function buildOpening(
  push: Push, base: THREE.Matrix4, w: WallBuild, o: OpeningBuild, glass: THREE.Material, H: number,
): void {
  const th = w.thickness;
  const ow = o.width;
  const oh = o.top - o.sill;
  if (ow < 0.1 || oh < 0.1) return;
  const cy = (o.sill + o.top) / 2;
  const jamb = 0.055;
  const depth = th * 1.12;

  // 四方の枠
  push(boxWorldUV(ow + jamb * 2, jamb, depth), TRIM.timber, base.clone().multiply(mat4(o.cx, o.top + jamb / 2, 0)));
  if (o.sill > 0.02) {
    push(boxWorldUV(ow + jamb * 2, jamb, depth), TRIM.timber, base.clone().multiply(mat4(o.cx, o.sill - jamb / 2, 0)));
    // 内側の窓台
    push(boxWorldUV(ow + 0.14, 0.03, th * 1.7), TRIM.timber,
      base.clone().multiply(mat4(o.cx, o.sill - jamb - 0.012, 0)));
  }
  push(boxWorldUV(jamb, oh + jamb * 2, depth), TRIM.timber, base.clone().multiply(mat4(o.cx - ow / 2 - jamb / 2, cy, 0)));
  push(boxWorldUV(jamb, oh + jamb * 2, depth), TRIM.timber, base.clone().multiply(mat4(o.cx + ow / 2 + jamb / 2, cy, 0)));

  if (o.kind === 'window') {
    // 引き違いの建具。中央に召し合わせ、上下に框
    const rail = 0.045;
    const mat = w.traditional ? TRIM.timber : TRIM.sash;
    push(boxWorldUV(ow, rail, 0.035), mat, base.clone().multiply(mat4(o.cx, o.top - rail / 2, 0)));
    push(boxWorldUV(ow, rail, 0.035), mat, base.clone().multiply(mat4(o.cx, o.sill + rail / 2, 0)));
    push(boxWorldUV(rail, oh, 0.035), mat, base.clone().multiply(mat4(o.cx, cy, 0)));
    push(boxWorldUV(rail * 0.7, oh, 0.035), mat, base.clone().multiply(mat4(o.cx - ow / 2 + rail * 0.35, cy, 0)));
    push(boxWorldUV(rail * 0.7, oh, 0.035), mat, base.clone().multiply(mat4(o.cx + ow / 2 - rail * 0.35, cy, 0)));
    push(planeWorldUV(ow, oh), glass, base.clone().multiply(mat4(o.cx, cy, 0)));

    if (w.traditional) {
      // 障子の桟。細い格子が入るだけで和室の見え方が変わる
      const cols = Math.max(2, Math.round(ow / 0.3));
      const rows = Math.max(2, Math.round(oh / 0.3));
      const inner = th * 0.5 + 0.03;
      for (let i = 1; i < cols; i++) {
        push(boxWorldUV(0.012, oh, 0.016), TRIM.timber,
          base.clone().multiply(mat4(o.cx - ow / 2 + (ow * i) / cols, cy, inner)));
      }
      for (let j = 1; j < rows; j++) {
        push(boxWorldUV(ow, 0.012, 0.016), TRIM.timber,
          base.clone().multiply(mat4(o.cx, o.sill + (oh * j) / rows, inner)));
      }
      push(planeWorldUV(ow, oh), TRIM.paperShoji, base.clone().multiply(mat4(o.cx, cy, inner - 0.009)));
    }
    return;
  }

  if (o.kind === 'door' || o.kind === 'entrance') {
    const leafH = Math.min(oh, H - 0.02);
    const slab = o.kind === 'entrance' ? TRIM.timberDark : TRIM.door;
    // 建具は開けた状態で置く。閉めたままだと光も視線も通らず、部屋の見え方が分からない
    if (ow > 1.05) {
      // 引き戸: 片側に引き込み、半分ほどを開ける
      const leafW = Math.min(ow * 0.55, 1.0);
      const x = o.cx - ow / 2 + leafW / 2;
      push(boxWorldUV(leafW, leafH, 0.033), slab,
        base.clone().multiply(mat4(x, o.sill + leafH / 2, th * 0.22)));
      push(boxWorldUV(0.09, 0.02, 0.02), TRIM.handle,
        base.clone().multiply(mat4(x + leafW * 0.34, o.sill + leafH * 0.45, th * 0.22 + 0.027)));
    } else {
      // 開き戸: 丁番を軸に開く
      const leafW = Math.min(ow - 0.03, 0.95);
      const hinge = o.cx - ow / 2 + 0.02;
      const open = 1.32; // 約75度
      const leaf = base
        .clone()
        .multiply(mat4(hinge, o.sill + leafH / 2, 0, open))
        .multiply(mat4(leafW / 2, 0, 0));
      push(boxWorldUV(leafW, leafH, 0.033), slab, leaf);
      push(new THREE.CylinderGeometry(0.012, 0.012, 0.12, 8), TRIM.handle,
        base
          .clone()
          .multiply(mat4(hinge, o.sill + leafH * 0.45, 0, open))
          .multiply(mat4(leafW - 0.07, 0, 0.03, 0, Math.PI / 2)));
    }
    // 敷居
    push(boxWorldUV(ow, 0.022, th * 1.2), TRIM.timber, base.clone().multiply(mat4(o.cx, o.sill + 0.011, 0)));
  }
}

/** 設備。大きさの当たりが付けばよいので、輪郭だけ丁寧に作る */
function buildWaterUnit(push: Push, u: WaterUnit, x: number, z: number): void {
  const at = (dx: number, y: number, dz: number, ry = 0) => mat4(x + dx, y, z + dz, ry);
  switch (u) {
    case 'kitchen':
      push(boxWorldUV(2.4, 0.82, 0.62), TRIM.cabinet, at(0, 0.41, 0));
      push(boxWorldUV(2.5, 0.05, 0.68), TRIM.worktop, at(0, 0.845, 0));
      push(boxWorldUV(0.62, 0.03, 0.42), TRIM.steel, at(-0.55, 0.855, 0));
      push(new THREE.CylinderGeometry(0.018, 0.018, 0.32, 10), TRIM.steel, at(-0.55, 1.03, -0.2));
      push(new THREE.CylinderGeometry(0.016, 0.016, 0.16, 10), TRIM.steel, at(-0.55, 1.18, -0.12, 0));
      push(boxWorldUV(2.4, 0.36, 0.3), TRIM.cabinet, at(0, 1.72, -0.14));
      break;
    case 'toilet':
      push(boxWorldUV(0.38, 0.42, 0.62), TRIM.porcelain, at(0, 0.21, 0));
      push(new THREE.CylinderGeometry(0.19, 0.17, 0.12, 20), TRIM.porcelain, at(0, 0.42, 0.09));
      push(boxWorldUV(0.4, 0.4, 0.2), TRIM.porcelain, at(0, 0.55, -0.28));
      break;
    case 'bath':
      push(boxWorldUV(1.6, 0.58, 0.8), TRIM.porcelain, at(0, 0.29, 0));
      push(boxWorldUV(1.44, 0.02, 0.64), TRIM.water, at(0, 0.5, 0));
      push(new THREE.CylinderGeometry(0.016, 0.016, 0.2, 10), TRIM.steel, at(-0.68, 0.72, 0));
      break;
    case 'sink':
      push(boxWorldUV(0.74, 0.72, 0.5), TRIM.cabinet, at(0, 0.36, 0));
      push(boxWorldUV(0.8, 0.05, 0.55), TRIM.worktop, at(0, 0.745, 0));
      push(new THREE.CylinderGeometry(0.2, 0.16, 0.11, 20), TRIM.porcelain, at(0, 0.79, 0));
      push(new THREE.CylinderGeometry(0.015, 0.015, 0.26, 10), TRIM.steel, at(0, 0.9, -0.17));
      push(boxWorldUV(0.7, 0.8, 0.03), TRIM.worktop, at(0, 1.35, -0.24));
      break;
  }
}
