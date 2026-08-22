import { pointInPolygon, type Finish, type RenovationScene, type RoomScene, type XY } from '@hiraku/core';

/**
 * 図面のデータを「建物として組み立てるための部品表」に変換する。
 * three.js の描画から計算を切り離しておくと、見た目を作り替えても寸法の扱いは変わらない。
 * 長さの単位はすべて m。座標は three.js の (x, y=高さ, z)。図面の y は z になる。
 */

export interface WallPanel {
  /** 壁の始点からの距離(m) */
  off: number;
  w: number;
  /** 床からの高さ(m) */
  y: number;
  h: number;
}

export interface OpeningBuild {
  id: string;
  kind: 'door' | 'window' | 'entrance' | 'other';
  /** 壁の中心を0とした位置(m) */
  cx: number;
  width: number;
  sill: number;
  top: number;
  /** 外に面している向き(+1 なら壁のローカル +z 側が外) 0 なら内部の建具 */
  outward: 1 | -1 | 0;
}

export interface WallBuild {
  id: string;
  /** 壁の中心(world) */
  cx: number;
  cz: number;
  angle: number;
  len: number;
  thickness: number;
  panels: WallPanel[];
  openings: OpeningBuild[];
  /** ローカル +z 側の部屋の壁仕上げ */
  finishPlus: Finish;
  finishMinus: Finish;
  /** 外壁か（片側に部屋が無い） */
  exterior: boolean;
  /** 畳・土間に面する壁。建具を和の意匠にするかの判断に使う */
  traditional: boolean;
  structural: 'unknown' | 'suspected' | 'cleared_by_expert';
}

export interface PostBuild {
  x: number;
  z: number;
  size: number;
  h: number;
}

export interface BeamBuild {
  cx: number;
  cz: number;
  angle: number;
  len: number;
  w: number;
  h: number;
  y: number;
}

export interface SunSpec {
  /** 太陽の位置(world) */
  position: [number, number, number];
  /** 影の対象範囲(m)。狭いほど影がはっきりする */
  radius: number;
  /** 建物の中心までの距離(m)。影のニアクリップを詰めるのに使う */
  distance: number;
  intensity: number;
  color: string;
}

export interface WindowLight {
  /** 開口の中心(world) */
  position: [number, number, number];
  /** 室内を向く法線 */
  normal: [number, number, number];
  width: number;
  height: number;
}

export interface Bounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  cx: number;
  cz: number;
  /** 外接円の半径 */
  r: number;
}

export interface Building {
  height: number;
  walls: WallBuild[];
  posts: PostBuild[];
  beams: BeamBuild[];
  windows: WindowLight[];
  sun: SunSpec;
  bounds: Bounds;
  rooms: RoomScene[];
}

/** 壁のローカル +z が指す図面上の向き */
function plusZDir(angle: number): XY {
  return { x: -Math.sin(angle), y: Math.cos(angle) };
}

function roomAt(rooms: RoomScene[], p: XY): RoomScene | null {
  for (const r of rooms) {
    if (r.outline.length >= 3 && pointInPolygon(p, r.outline)) return r;
  }
  return null;
}

/** 時刻の指定から太陽の向きを決める（真南を基準にした簡易な擬似太陽） */
export type LightKey = 'morning' | 'noon' | 'evening' | 'night';

const SUN_SETTING: Record<LightKey, { alt: number; swing: number; intensity: number; color: string }> = {
  // alt: 仰角(度) / swing: 主要開口の正面からの振り(度) / intensity: 強さ
  morning: { alt: 24, swing: -52, intensity: 3.2, color: '#ffe2b8' },
  noon: { alt: 58, swing: 8, intensity: 3.6, color: '#fff4e2' },
  evening: { alt: 13, swing: 48, intensity: 2.8, color: '#ffc48a' },
  night: { alt: 40, swing: 0, intensity: 0.06, color: '#9fb4d8' },
};

export function buildBuilding(scene: RenovationScene, light: LightKey = 'noon'): Building | null {
  const level = scene.model.levels[0];
  if (!level) return null;
  const H = (level.heightMm ?? 2400) / 1000;
  const nodeById = new Map(level.nodes.map((n) => [n.id, n] as const));
  const rooms = scene.rooms;

  // 建物の広がり
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const n of level.nodes) {
    minX = Math.min(minX, n.x / 1000);
    maxX = Math.max(maxX, n.x / 1000);
    minZ = Math.min(minZ, n.y / 1000);
    maxZ = Math.max(maxZ, n.y / 1000);
  }
  if (!isFinite(minX)) return null;
  const bounds: Bounds = {
    minX, maxX, minZ, maxZ,
    cx: (minX + maxX) / 2,
    cz: (minZ + maxZ) / 2,
    r: Math.max(3, Math.hypot(maxX - minX, maxZ - minZ) / 2),
  };

  const walls: WallBuild[] = [];
  const windows: WindowLight[] = [];
  const postAt = new Map<string, PostBuild>();

  for (const w of level.walls) {
    const a = nodeById.get(w.a);
    const b = nodeById.get(w.b);
    if (!a || !b) continue;
    const len = Math.hypot(b.x - a.x, b.y - a.y) / 1000;
    if (len < 0.02) continue;
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    const th = Math.max(0.05, w.thickness / 1000);
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const nrm = plusZDir(angle);
    const probe = (s: number): XY => ({
      x: mid.x + nrm.x * s * (w.thickness / 2 + 260),
      y: mid.y + nrm.y * s * (w.thickness / 2 + 260),
    });
    const rPlus = roomAt(rooms, probe(1));
    const rMinus = roomAt(rooms, probe(-1));

    const raw = level.openings
      .filter((o) => o.wallId === w.id)
      .map((o) => ({
        id: o.id,
        kind: o.kind,
        from: o.offset / 1000,
        to: (o.offset + o.width) / 1000,
        sill: o.sillHeight / 1000,
        top: Math.min(H, (o.sillHeight + o.height) / 1000),
      }))
      .filter((o) => o.to > o.from && o.top > o.sill)
      .sort((p, q) => p.from - q.from);

    // 壁面を開口で切り分ける
    const panels: WallPanel[] = [];
    let cursor = 0;
    for (const o of raw) {
      const from = Math.max(0, Math.min(len, o.from));
      const to = Math.max(0, Math.min(len, o.to));
      if (from > cursor) panels.push({ off: cursor, w: from - cursor, y: 0, h: H });
      if (o.sill > 0.001) panels.push({ off: from, w: to - from, y: 0, h: o.sill });
      if (o.top < H - 0.001) panels.push({ off: from, w: to - from, y: o.top, h: H - o.top });
      cursor = Math.max(cursor, to);
    }
    if (cursor < len) panels.push({ off: cursor, w: len - cursor, y: 0, h: H });

    const exterior = !rPlus || !rMinus;
    const outward: 1 | -1 | 0 = !rPlus ? 1 : !rMinus ? -1 : 0;

    const openings: OpeningBuild[] = raw.map((o) => ({
      id: o.id,
      kind: o.kind,
      cx: (o.from + o.to) / 2 - len / 2,
      width: o.to - o.from,
      sill: o.sill,
      top: o.top,
      outward,
    }));

    // 窓からの採光を、開口ごとの面光源として登録する
    for (const o of openings) {
      if (o.kind !== 'window' && o.kind !== 'entrance') continue;
      if (o.outward === 0) continue;
      const t = o.cx + len / 2;
      const px = (a.x + (b.x - a.x) * (t / len)) / 1000;
      const pz = (a.y + (b.y - a.y) * (t / len)) / 1000;
      // 室内向きの法線（外の反対）
      const s = -o.outward;
      windows.push({
        position: [px + nrm.x * s * th * 0.5, (o.sill + o.top) / 2, pz + nrm.y * s * th * 0.5],
        normal: [nrm.x * s, 0, nrm.y * s],
        width: o.width,
        height: o.top - o.sill,
      });
    }

    walls.push({
      id: w.id,
      cx: mid.x / 1000,
      cz: mid.y / 1000,
      angle,
      len,
      thickness: th,
      panels,
      openings,
      finishPlus: rPlus?.wall ?? rMinus?.wall ?? rooms[0]?.wall ?? fallbackFinish(),
      finishMinus: rMinus?.wall ?? rPlus?.wall ?? rooms[0]?.wall ?? fallbackFinish(),
      exterior,
      traditional: [rPlus, rMinus].some(
        (r) => r?.floor.id === 'tatami_omote' || r?.floor.id === 'doma',
      ),
      structural: w.structural,
    });

    // 柱は節点ごとに一本。太いほうの壁に合わせる
    for (const n of [a, b]) {
      const cur = postAt.get(n.id);
      const size = th * 1.15;
      if (!cur || cur.size < size) {
        postAt.set(n.id, { x: n.x / 1000, z: n.y / 1000, size, h: H });
      }
    }
  }

  // 天井が板張りの部屋には梁を見せる（和の空間らしさが出る）
  const beams: BeamBuild[] = [];
  for (const r of rooms) {
    if (r.ceiling.id !== 'ceiling_board' || r.outline.length < 3) continue;
    const xs = r.outline.map((p) => p.x / 1000);
    const zs = r.outline.map((p) => p.y / 1000);
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    const z0 = Math.min(...zs);
    const z1 = Math.max(...zs);
    const spanX = x1 - x0;
    const spanZ = z1 - z0;
    if (Math.max(spanX, spanZ) < 2.2) continue;
    const along = spanX >= spanZ; // 長手方向に直交して架ける
    const count = Math.max(1, Math.min(4, Math.floor((along ? spanX : spanZ) / 1.82)));
    for (let i = 1; i <= count; i++) {
      const t = i / (count + 1);
      if (along) {
        beams.push({
          cx: x0 + spanX * t, cz: (z0 + z1) / 2, angle: Math.PI / 2,
          len: spanZ, w: 0.14, h: 0.26, y: H - 0.16,
        });
      } else {
        beams.push({
          cx: (x0 + x1) / 2, cz: z0 + spanZ * t, angle: 0,
          len: spanX, w: 0.14, h: 0.26, y: H - 0.16,
        });
      }
    }
  }

  return {
    height: H,
    walls,
    posts: [...postAt.values()],
    beams,
    windows,
    sun: sunFor(windows, bounds, light),
    bounds,
    rooms,
  };
}

function fallbackFinish(): Finish {
  return { id: 'paint', label: '塗装', color: '#e8e4dc', roughness: 0.9, phrase: 'matte painted wall' };
}

/** いちばん大きい窓の外から光を入れる。窓が無ければ建物の斜め上から */
function sunFor(windows: WindowLight[], b: Bounds, key: LightKey): SunSpec {
  const s = SUN_SETTING[key];
  const best = [...windows].sort((p, q) => q.width * q.height - p.width * p.height)[0];
  // 室内向き法線の逆＝外向き
  let dx = 0.6;
  let dz = 0.8;
  if (best) {
    dx = -best.normal[0];
    dz = -best.normal[2];
  }
  const swing = (s.swing * Math.PI) / 180;
  const rx = dx * Math.cos(swing) - dz * Math.sin(swing);
  const rz = dx * Math.sin(swing) + dz * Math.cos(swing);
  const d = Math.hypot(rx, rz) || 1;
  // 影の精度は「視錐台の広さ」で決まる。建物ぎりぎりまで詰める
  const dist = b.r * 2 + 5;
  const alt = (s.alt * Math.PI) / 180;
  return {
    position: [
      b.cx + (rx / d) * dist * Math.cos(alt),
      Math.max(2.5, dist * Math.sin(alt)),
      b.cz + (rz / d) * dist * Math.cos(alt),
    ],
    radius: b.r + 1.2,
    distance: dist,
    intensity: s.intensity,
    color: s.color,
  };
}
