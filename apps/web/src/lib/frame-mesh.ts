import * as THREE from 'three';
import type { Member, MemberKind } from '@hiraku/core';

/**
 * 軸組を three.js の形にする。
 *
 * 部材は数百〜数千本になるので、ひとつの InstancedMesh にまとめて1回で描く。
 * まとめても instanceId が残るので、触った1本がどれかは分かる。
 */

export type FrameColorMode = 'role' | 'confidence';

/** 力の伝わり方で色を分ける。ひと目で「持っているもの」と「下地」が分かるように */
const ROLE_OF: Record<MemberKind, 'vertical' | 'horizontal' | 'brace' | 'nuki' | 'sub'> = {
  dodai: 'vertical',
  toshibashira: 'vertical',
  kudabashira: 'vertical',
  yukazuka: 'vertical',
  koyazuka: 'vertical',
  keta: 'horizontal',
  doubuchi: 'horizontal',
  hari: 'horizontal',
  koyabari: 'horizontal',
  munagi: 'horizontal',
  moya: 'horizontal',
  oobiki: 'horizontal',
  magusa: 'horizontal',
  sujikai: 'brace',
  hiuchi: 'brace',
  nuki: 'nuki',
  mabashira: 'sub',
  neda: 'sub',
  taruki: 'sub',
  nobuchi: 'sub',
  nobuchiuke: 'sub',
  madodai: 'sub',
};

const ROLE_COLOR = {
  vertical: new THREE.Color('#8a5a33'),   // 立って持つもの
  horizontal: new THREE.Color('#6b4326'), // 横に渡すもの
  brace: new THREE.Color('#a8402c'),      // ゆがみを止めるもの（筋かい・火打）
  nuki: new THREE.Color('#9b7a5e'),       // 貫。本数が多いので、目に刺さらない濃さにする
  sub: new THREE.Color('#c2a889'),        // 下地
};

/** 確度の3色。図面や見積と同じ意味で使う */
const CONF_COLOR = {
  estimated: new THREE.Color('#a8a29a'),
  hypothesis: new THREE.Color('#c08a12'),
  measured: new THREE.Color('#2f7a58'),
};

export interface FrameMesh {
  group: THREE.Group;
  mesh: THREE.InstancedMesh;
  /** instanceId から部材を引く */
  at: (instanceId: number) => Member | undefined;
  /** 1本だけ光らせる。null で消す */
  highlight: (memberId: string | null) => void;
  setColorMode: (mode: FrameColorMode) => void;
  dispose: () => void;
}

const UP = new THREE.Vector3(0, 1, 0);
const XA = new THREE.Vector3(1, 0, 0);
const ZA = new THREE.Vector3(0, 0, 1);

/** 図面座標(mm) → three.js のワールド(m)。図面のyが奥行き、zが高さ */
function world(p: { x: number; y: number; z: number }, out: THREE.Vector3): THREE.Vector3 {
  return out.set(p.x / 1000, p.z / 1000, p.y / 1000);
}

/** 1本ぶんの姿勢。せいを鉛直に、幅を水平に向ける */
function poseOf(m: Member, out: THREE.Matrix4): number {
  const a = world(m.a, new THREE.Vector3());
  const b = world(m.b, new THREE.Vector3());
  const dir = b.clone().sub(a);
  const len = dir.length();
  if (len < 1e-6) return 0;
  dir.divideScalar(len);

  let right: THREE.Vector3;
  let up: THREE.Vector3;
  if (Math.abs(dir.y) > 0.98) {
    // 立っている材。断面の向きは平面で決める
    right = XA.clone();
    up = ZA.clone();
  } else {
    right = new THREE.Vector3().crossVectors(dir, UP).normalize();
    up = new THREE.Vector3().crossVectors(right, dir).normalize();
  }
  const w = m.section.w / 1000;
  const h = m.section.h / 1000;
  out.makeBasis(right.multiplyScalar(w), dir.multiplyScalar(len), up.multiplyScalar(h));
  out.setPosition(a.clone().add(b).multiplyScalar(0.5));
  return len;
}

export interface FrameMeshOptions {
  colorMode?: FrameColorMode;
  /** 見たい部材だけに絞る。空なら全部 */
  only?: Set<MemberKind>;
}

export function buildFrameMesh(members: Member[], opt: FrameMeshOptions = {}): FrameMesh {
  const list = opt.only && opt.only.size
    ? members.filter((m) => opt.only!.has(m.kind))
    : members;

  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.72, metalness: 0 });
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(list.length, 1));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);

  const mat4 = new THREE.Matrix4();
  const kept: Member[] = [];
  for (const m of list) {
    const len = poseOf(m, mat4);
    if (len <= 0) continue;
    mesh.setMatrixAt(kept.length, mat4);
    kept.push(m);
  }
  mesh.count = kept.length;
  mesh.instanceMatrix.needsUpdate = true;

  let mode: FrameColorMode = opt.colorMode ?? 'role';
  let lit: string | null = null;
  const HL = new THREE.Color('#f0c419');

  const paint = () => {
    for (let i = 0; i < kept.length; i++) {
      const m = kept[i]!;
      const c = m.id === lit
        ? HL
        : mode === 'role'
          ? ROLE_COLOR[ROLE_OF[m.kind]]
          : CONF_COLOR[m.confidence];
      mesh.setColorAt(i, c);
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  };
  paint();

  const group = new THREE.Group();
  group.add(mesh);
  group.name = 'frame';

  const byIndex = kept;
  return {
    group,
    mesh,
    at: (i) => byIndex[i],
    highlight: (id) => { lit = id; paint(); },
    setColorMode: (m) => { mode = m; paint(); },
    dispose: () => {
      geo.dispose();
      mat.dispose();
      mesh.dispose();
      group.clear();
    },
  };
}

/** 軸組全体の外径。カメラを合わせるのに使う */
export function frameBounds(members: Member[]): { min: THREE.Vector3; max: THREE.Vector3 } {
  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  const v = new THREE.Vector3();
  for (const m of members) {
    for (const p of [m.a, m.b]) {
      world(p, v);
      min.min(v);
      max.max(v);
    }
  }
  return { min, max };
}
