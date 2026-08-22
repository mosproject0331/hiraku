import { distToEdges, pointInPolygon, poleOfInaccessibility, type RoomScene, type XY } from '@hiraku/core';
import type { Bounds, WindowLight } from './archviz';

/**
 * 空間に「人が使っている気配」を置く。
 * 家具は寸法の主張ではなく、広さの見当をつけるための添景として扱う。
 * 同じ間取り・同じ用途なら毎回同じ配置になるよう、乱数は種から作る。
 */

export type PropKind =
  | 'table' | 'chair' | 'stool' | 'sofa' | 'counter' | 'shelf' | 'rug'
  | 'lowTable' | 'cushion' | 'futon' | 'plant' | 'pendant' | 'floorLamp'
  | 'bench' | 'workbench' | 'bed' | 'displayTable' | 'bookshelf';

export interface Prop {
  kind: PropKind;
  /** world 座標(m) */
  x: number;
  z: number;
  /** Y軸まわりの回転(rad) */
  rot: number;
  /** 大きさの微調整 */
  s?: number;
}

export interface Plant {
  x: number;
  z: number;
  /** 0=低木 1=木 */
  kind: 0 | 1;
  h: number;
  r: number;
  rot: number;
}

function rng(seed: number): () => number {
  let s = (seed || 1) >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 部屋の長辺の向きと、内部の基準点 */
function roomFrame(room: RoomScene): { origin: XY; angle: number; long: number; short: number } | null {
  const pts = room.outline;
  if (pts.length < 3) return null;
  let best = 0;
  let angle = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    if (d > best) {
      best = d;
      angle = Math.atan2(b.y - a.y, b.x - a.x);
    }
  }
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const w = (Math.max(...xs) - Math.min(...xs)) / 1000;
  const h = (Math.max(...ys) - Math.min(...ys)) / 1000;
  return {
    origin: poleOfInaccessibility(pts),
    angle,
    long: Math.max(w, h),
    short: Math.min(w, h),
  };
}

/** 部屋の中で、壁からclearance以上離れた位置を探して置く */
function tryPlace(room: RoomScene, mmX: number, mmY: number, clearanceMm: number): XY | null {
  const p = { x: mmX, y: mmY };
  if (!pointInPolygon(p, room.outline)) return null;
  if (distToEdges(p, room.outline) < clearanceMm) return null;
  return p;
}

interface Ctx {
  room: RoomScene;
  origin: XY;
  ux: XY;
  uy: XY;
  rot: number;
  rand: () => number;
  out: Prop[];
  /** カメラの立ち位置(world m)。レンズの直前に家具を置かない */
  avoid: { x: number; z: number; r: number }[];
}

/** 基準点からローカル(u,v)[m]の位置に置く。入らなければ諦める */
function put(c: Ctx, kind: PropKind, u: number, v: number, clearance = 350, rotOffset = 0, s?: number): boolean {
  const mmX = c.origin.x + c.ux.x * u * 1000 + c.uy.x * v * 1000;
  const mmY = c.origin.y + c.ux.y * u * 1000 + c.uy.y * v * 1000;
  const p = tryPlace(c.room, mmX, mmY, clearance);
  if (!p) return false;
  for (const a of c.avoid) {
    if (Math.hypot(p.x / 1000 - a.x, p.y / 1000 - a.z) < a.r) return false;
  }
  c.out.push({ kind, x: p.x / 1000, z: p.y / 1000, rot: c.rot + rotOffset, s });
  return true;
}

/** 部屋の壁ぎわ（長辺に沿った端）に寄せて置く */
function putEdge(c: Ctx, kind: PropKind, side: 1 | -1, u: number, clearance = 420): boolean {
  for (let v = 3.0; v >= 0.3; v -= 0.2) {
    if (put(c, kind, u, v * side, clearance, side > 0 ? Math.PI : 0)) return true;
  }
  return false;
}

const USE_ALIAS: Record<string, string> = {
  minpaku: 'stay', kani_shukuhaku: 'stay', home_plus: 'cafe',
};

/**
 * 用途に合わせて家具を配置する。いちばん広い部屋を主室として扱い、
 * 残りの部屋には最小限だけ置く。
 */
export function layoutProps(
  rooms: RoomScene[],
  use: string | undefined,
  avoid: { x: number; z: number; r: number }[] = [],
  seed = 1,
): Prop[] {
  const out: Prop[] = [];
  const sorted = [...rooms].filter((r) => r.outline.length >= 3).sort((a, b) => b.areaM2 - a.areaM2);
  if (!sorted.length) return out;
  const key = USE_ALIAS[use ?? ''] ?? use ?? 'sharehouse';

  sorted.forEach((room, index) => {
    const fr = roomFrame(room);
    if (!fr) return;
    const rand = rng(seed + hash(room.roomId));
    const ux: XY = { x: Math.cos(fr.angle), y: Math.sin(fr.angle) };
    const uy: XY = { x: -Math.sin(fr.angle), y: Math.cos(fr.angle) };
    const c: Ctx = { room, origin: fr.origin, ux, uy, rot: -fr.angle, rand, out, avoid };
    const main = index === 0;
    const area = room.areaM2;

    // 水回りのある部屋は設備が主役なので添景は控える
    if (room.waterUnits.length > 0 && !main) {
      put(c, 'plant', 0.9, 0.9, 300);
      return;
    }
    if (area < 4) {
      put(c, 'stool', 0, 0, 300);
      return;
    }

    if (main) {
      layoutMain(c, key, area, fr.long);
    } else {
      layoutSub(c, key, area);
    }
  });

  return out;
}

function layoutMain(c: Ctx, key: string, area: number, long: number): void {
  const seats = Math.max(2, Math.min(8, Math.round(area / 3)));
  switch (key) {
    case 'cafe':
    case 'retail': {
      c.out.push({ kind: 'counter', x: 0, z: 0, rot: 0 }); // 仮置き、下で差し替え
      c.out.pop();
      putEdge(c, 'counter', -1, -long * 0.18, 900);
      const tables = Math.max(1, Math.min(4, Math.floor(area / 6)));
      for (let i = 0; i < tables; i++) {
        const u = (i - (tables - 1) / 2) * 1.7;
        if (put(c, key === 'retail' ? 'displayTable' : 'table', u, 0.55, 620)) {
          if (key !== 'retail') {
            put(c, 'chair', u - 0.62, 0.55, 420, Math.PI / 2);
            put(c, 'chair', u + 0.62, 0.55, 420, -Math.PI / 2);
          }
        }
      }
      putEdge(c, 'shelf', 1, long * 0.22, 480);
      put(c, 'plant', -long * 0.34, -0.4, 380);
      break;
    }
    case 'stay': {
      put(c, 'rug', 0, 0, 700, 0, Math.min(1.5, Math.max(0.9, area / 12)));
      put(c, 'lowTable', 0, 0, 620);
      put(c, 'cushion', -0.95, 0.1, 420, 0.4);
      put(c, 'cushion', 0.95, -0.1, 420, -0.9);
      putEdge(c, 'futon', 1, -long * 0.2, 700);
      putEdge(c, 'shelf', -1, long * 0.24, 460);
      put(c, 'floorLamp', -long * 0.3, 0.6, 380);
      put(c, 'plant', long * 0.32, -0.55, 360);
      break;
    }
    case 'atelier': {
      putEdge(c, 'workbench', -1, -long * 0.12, 800);
      put(c, 'stool', -long * 0.12, -0.75, 380);
      put(c, 'stool', long * 0.05, -0.75, 380);
      putEdge(c, 'shelf', 1, long * 0.18, 460);
      put(c, 'table', long * 0.2, 0.5, 640);
      put(c, 'plant', -long * 0.34, 0.7, 360);
      break;
    }
    case 'coworking': {
      put(c, 'table', 0, 0, 760, 0, 1.5);
      for (let i = 0; i < Math.min(6, seats); i++) {
        const u = (i % 3) - 1;
        const v = i < 3 ? -0.78 : 0.78;
        put(c, 'chair', u * 0.85, v, 420, i < 3 ? 0 : Math.PI);
      }
      putEdge(c, 'shelf', 1, long * 0.2, 460);
      put(c, 'plant', -long * 0.32, 0.6, 360);
      break;
    }
    case 'library': {
      putEdge(c, 'bookshelf', -1, -long * 0.2, 520);
      putEdge(c, 'bookshelf', -1, long * 0.05, 520);
      putEdge(c, 'bookshelf', 1, -long * 0.05, 520);
      put(c, 'rug', 0.2, 0.3, 700, 0, 1.2);
      put(c, 'sofa', 0.2, 0.3, 760, 0.2);
      put(c, 'lowTable', 0.2, -0.6, 560);
      put(c, 'floorLamp', -0.9, 0.5, 360);
      break;
    }
    default: {
      // シェアハウス・住まいの居間
      put(c, 'rug', -0.2, 0.2, 780, 0, Math.min(1.6, Math.max(1, area / 11)));
      put(c, 'sofa', -0.2, 1.0, 800, 0);
      put(c, 'lowTable', -0.2, 0.15, 620);
      put(c, 'table', long * 0.24, -0.2, 700);
      put(c, 'chair', long * 0.24 - 0.6, -0.2, 420, Math.PI / 2);
      put(c, 'chair', long * 0.24 + 0.6, -0.2, 420, -Math.PI / 2);
      putEdge(c, 'shelf', -1, -long * 0.24, 460);
      put(c, 'plant', long * 0.34, 0.8, 360);
      break;
    }
  }
  // 主室には吊り下げの照明を1つ（夜の絵が成立する）。
  // カメラの真上に来るとレンズを塞ぐので、少しずらせる場所を探す
  const spots: [number, number][] = [[0, 0], [1.1, 0], [-1.1, 0], [0, 1.1], [0, -1.1], [1.6, 1.2]];
  for (const [u, v] of spots) {
    if (put(c, 'pendant', u, v, 300)) break;
  }
}

function layoutSub(c: Ctx, key: string, area: number): void {
  if (key === 'stay' && area >= 6) {
    put(c, 'bed', 0, 0, 900) || put(c, 'futon', 0, 0, 700);
    put(c, 'floorLamp', 0.9, 0.9, 340);
    return;
  }
  if (area >= 9) {
    put(c, 'table', 0, 0, 700);
    put(c, 'chair', -0.62, 0, 420, Math.PI / 2);
    put(c, 'chair', 0.62, 0, 420, -Math.PI / 2);
  } else if (area >= 5) {
    put(c, 'shelf', 0, 0, 460);
    put(c, 'plant', 0.8, 0.6, 320);
  } else {
    put(c, 'plant', 0, 0, 320);
  }
}

/**
 * 窓の外に緑を置く。室内から見たときに「外がある」ことが分かると、
 * 同じ間取りでも写真らしさが一段変わる。
 */
export function layoutPlants(windows: WindowLight[], b: Bounds, seed = 3): Plant[] {
  const rand = rng(seed);
  const out: Plant[] = [];
  const seen = new Set<string>();
  for (const w of windows) {
    // 室内向き法線の逆＝外
    const ox = -w.normal[0];
    const oz = -w.normal[2];
    for (let i = 0; i < 2; i++) {
      const away = 1.8 + rand() * 3.4;
      const side = (rand() - 0.5) * 3.6;
      const x = w.position[0] + ox * away - oz * side;
      const z = w.position[2] + oz * away + ox * side;
      const k = `${Math.round(x)}:${Math.round(z)}`;
      if (seen.has(k)) continue;
      seen.add(k);
      // 建物の中には置かない
      if (x > b.minX - 0.6 && x < b.maxX + 0.6 && z > b.minZ - 0.6 && z < b.maxZ + 0.6) continue;
      const tree = rand() > 0.55;
      out.push({
        x, z,
        kind: tree ? 1 : 0,
        h: tree ? 3.2 + rand() * 2.6 : 0.5 + rand() * 0.7,
        r: tree ? 1.1 + rand() * 0.9 : 0.45 + rand() * 0.4,
        rot: rand() * Math.PI,
      });
    }
  }
  return out.slice(0, 14);
}
