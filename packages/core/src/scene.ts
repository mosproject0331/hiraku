import type { RenovationOp, Room, SpaceModel } from './types';
import { dist, distToEdges, pointInPolygon, poleOfInaccessibility, type XY } from './geometry';
import { detectFaces, detectRooms } from './rooms';
import { applyOps } from './ops';

/** 仕上げ材の見た目。パース生成の条件画像に使う */
export interface Finish {
  id: string;
  label: string;
  color: string;
  /** 0=鏡面 1=完全な拡散。three.js の roughness */
  roughness: number;
  /** 写実化のプロンプトに渡す素材の言葉 */
  phrase: string;
}

export const FINISHES: Record<string, Finish> = {
  flooring:      { id: 'flooring',      label: 'フローリング',   color: '#b08654', roughness: 0.55, phrase: 'warm oak flooring with visible grain' },
  cushion_floor: { id: 'cushion_floor', label: 'クッションフロア', color: '#c8b89a', roughness: 0.7,  phrase: 'matte vinyl sheet flooring' },
  tatami_omote:  { id: 'tatami_omote',  label: '畳',            color: '#c3c88a', roughness: 0.9,  phrase: 'fresh tatami mats with cloth borders' },
  doma:          { id: 'doma',          label: '土間',          color: '#6f6257', roughness: 0.85, phrase: 'polished earthen doma floor (tataki)' },
  cloth:         { id: 'cloth',         label: 'クロス',        color: '#efeae2', roughness: 0.95, phrase: 'plain off-white wall covering' },
  shikkui_diy:   { id: 'shikkui_diy',   label: '漆喰',          color: '#f3efe6', roughness: 1.0,  phrase: 'hand-troweled shikkui plaster with soft texture' },
  paint:         { id: 'paint',         label: '塗装',          color: '#e8e4dc', roughness: 0.9,  phrase: 'matte painted wall' },
  ceiling_paint: { id: 'ceiling_paint', label: '天井塗装',      color: '#f2efe9', roughness: 0.95, phrase: 'matte painted ceiling' },
  ceiling_board: { id: 'ceiling_board', label: '天井板',        color: '#a98e6b', roughness: 0.7,  phrase: 'exposed timber ceiling boards' },
  /** 手つかずの既存部分 */
  as_is_floor:   { id: 'as_is_floor',   label: '既存の床',      color: '#9c8a72', roughness: 0.85, phrase: 'aged timber floor' },
};

export type WaterUnit = 'kitchen' | 'toilet' | 'bath' | 'sink';

export interface RoomScene {
  roomId: string;
  name: string;
  areaM2: number;
  /** 部屋の外周（mm, 図面座標） */
  outline: XY[];
  floor: Finish;
  wall: Finish;
  ceiling: Finish;
  waterUnits: WaterUnit[];
  /** 追加した照明の数 */
  lights: number;
}

export interface CameraSpec {
  id: string;
  label: string;
  /** three.js 座標(m)。y が高さ */
  position: [number, number, number];
  target: [number, number, number];
  fovDeg: number;
}

export interface RenovationScene {
  /** ops 適用後のモデル */
  model: SpaceModel;
  rooms: RoomScene[];
  cameras: CameraSpec[];
  /** 撤去された壁の数など、言葉で伝えたい変化 */
  changes: string[];
}

const DEFAULT_FLOOR = FINISHES['as_is_floor']!;
const DEFAULT_WALL = FINISHES['paint']!;
const DEFAULT_CEILING = FINISHES['ceiling_paint']!;

/** 部屋名から、既定の床仕上げを推測する（土間・和室は見た目が大きく違う） */
function guessFloor(name: string): Finish {
  if (name.includes('土間')) return FINISHES['doma']!;
  if (name.includes('和室') || name.includes('座敷')) return FINISHES['tatami_omote']!;
  return DEFAULT_FLOOR;
}

/** 改修案(ops)を適用した3Dシーンの材料表をつくる */
export function buildRenovationScene(model: SpaceModel, ops: RenovationOp[]): RenovationScene {
  const next = applyOps(model, ops);
  const level = next.levels[0];
  const changes: string[] = [];
  if (!level) return { model: next, rooms: [], cameras: [], changes };

  const rooms = detectRooms(level);
  const faces = detectFaces(level);
  const nodeById = new Map(level.nodes.map((n) => [n.id, n] as const));

  const byRoom = new Map<string, RoomScene>();
  rooms.forEach((r: Room, i) => {
    const f = faces[i];
    const outline: XY[] = f ? f.nodeIds.map((id) => nodeById.get(id)!).filter(Boolean) : [];
    byRoom.set(r.id, {
      roomId: r.id,
      name: r.name,
      areaM2: r.areaM2,
      outline,
      floor: guessFloor(r.name),
      wall: DEFAULT_WALL,
      ceiling: DEFAULT_CEILING,
      waterUnits: [],
      lights: 0,
    });
  });

  // opsの roomId は「改修前」のモデル基準。部屋idは壁を消すと振り直されるため、
  // まず名前で突き合わせる（idで引くと別の部屋に当たってしまう）
  const beforeRooms = detectRooms(model.levels[0]!);
  const idToName = new Map(beforeRooms.map((r) => [r.id, r.name] as const));
  const findScene = (roomId: string): RoomScene | undefined => {
    const name = idToName.get(roomId);
    if (name) {
      const byName = [...byRoom.values()].find((s) => s.name === name);
      if (byName) return byName;
    }
    // 名前が見つからない（部屋が統合された等）ときだけ id で引く
    return byRoom.get(roomId);
  };

  let removed = 0;
  for (const op of ops) {
    switch (op.op) {
      case 'remove_partition':
        removed += 1;
        break;
      case 'change_floor': {
        const s = findScene(op.roomId);
        const fin = FINISHES[op.finishId];
        if (s && fin) {
          s.floor = fin;
          changes.push(`${s.name}の床を${fin.label}に`);
        }
        break;
      }
      case 'change_wall_finish': {
        const s = findScene(op.roomId);
        const fin = FINISHES[op.finishId];
        if (s && fin) {
          s.wall = fin;
          changes.push(`${s.name}の壁を${fin.label}に`);
        }
        break;
      }
      case 'change_ceiling': {
        const s = findScene(op.roomId);
        const fin = FINISHES[op.finishId];
        if (s && fin) {
          s.ceiling = fin;
          changes.push(`${s.name}の天井を${fin.label}に`);
        }
        break;
      }
      case 'add_water_unit': {
        const s = findScene(op.roomId);
        if (s) {
          s.waterUnits.push(op.unit);
          const jp = { kitchen: 'キッチン', toilet: 'トイレ', bath: '浴室', sink: '洗面' }[op.unit];
          changes.push(`${s.name}に${jp}を新設`);
        }
        break;
      }
      case 'electrical': {
        if (op.work === 'lighting_diy') {
          const s = op.roomId ? findScene(op.roomId) : [...byRoom.values()][0];
          if (s) s.lights += op.count;
          changes.push(`照明を${op.count}箇所`);
        }
        break;
      }
      case 'insulate':
        if (op.target === 'window_inner') changes.push('内窓を設置');
        break;
      default:
        break;
    }
  }
  if (removed > 0) changes.unshift(`間仕切りを${removed}枚撤去して一室に`);

  return {
    model: next,
    rooms: [...byRoom.values()],
    cameras: interiorCameras(next),
    changes,
  };
}

/**
 * 室内の見せ場からのカメラを提案する。
 * いちばん広い部屋の隅に立ち、部屋の奥（できれば窓のある方）を見る構図。
 */
export function interiorCameras(model: SpaceModel, max = 3): CameraSpec[] {
  const level = model.levels[0];
  if (!level) return [];
  const rooms = detectRooms(level);
  const faces = detectFaces(level);
  const nodeById = new Map(level.nodes.map((n) => [n.id, n] as const));
  const eye = 1.5; // 立った目線の高さ(m)
  const out: CameraSpec[] = [];

  /** 壁の上にある開口の中心（図面座標mm）と種別 */
  const openingCenter = (wallId: string): { p: XY; kind: string; width: number } | null => {
    const w = level.walls.find((x) => x.id === wallId);
    if (!w) return null;
    const a = nodeById.get(w.a);
    const b = nodeById.get(w.b);
    if (!a || !b) return null;
    const len = dist(a, b);
    if (len < 1) return null;
    const ops = level.openings.filter((o) => o.wallId === wallId);
    if (!ops.length) return null;
    // いちばん広い開口を代表にする（窓を優先）
    const best = ops.sort(
      (p, q) => (q.kind === 'window' ? 1e6 : 0) + q.width - ((p.kind === 'window' ? 1e6 : 0) + p.width),
    )[0]!;
    const t0 = (best.offset + best.width / 2) / len;
    return {
      p: { x: a.x + (b.x - a.x) * t0, y: a.y + (b.y - a.y) * t0 },
      kind: best.kind,
      width: best.width,
    };
  };

  rooms.slice(0, max).forEach((r, i) => {
    const f = faces[i];
    if (!f) return;
    const pts: XY[] = f.nodeIds.map((id) => nodeById.get(id)!).filter(Boolean);
    if (pts.length < 3) return;
    // L字の部屋では重心が外に出るので、壁からいちばん離れた内部点を基準にする
    const c = poleOfInaccessibility(pts);

    // この部屋の壁にある開口のうち、いちばん見せ場になるもの
    const lit = r.wallLoop
      .map((wid) => openingCenter(wid))
      .filter((x): x is { p: XY; kind: string; width: number } => x !== null)
      .sort((p, q) => (q.kind === 'window' ? 1e6 : 0) + q.width - ((p.kind === 'window' ? 1e6 : 0) + p.width))[0];

    const MIN_CLEARANCE = 500; // 壁からこれだけ離れて立つ(mm)
    const insideEnough = (p: XY) => pointInPolygon(p, pts) && distToEdges(p, pts) >= MIN_CLEARANCE;

    let look: XY;
    let stand: XY;
    if (lit) {
      // 開口を正面に見て、そこから最も後ろに下がれる位置に立つ（光が入る構図）
      look = lit.p;
      const dx = c.x - lit.p.x;
      const dy = c.y - lit.p.y;
      const d = Math.hypot(dx, dy) || 1;
      const ux = dx / d;
      const uy = dy / d;
      // 開口から離れる方向に少しずつ下がり、部屋の中に居られる最遠点を採る
      stand = c;
      for (let back = d * 0.6; back <= d * 2.2; back += 150) {
        const cand = { x: lit.p.x + ux * back, y: lit.p.y + uy * back };
        if (insideEnough(cand)) stand = cand;
      }
      if (!insideEnough(stand)) stand = c;
    } else {
      // 開口が無ければ、いちばん長い対角を使う
      let a = pts[0]!;
      let b = pts[1] ?? pts[0]!;
      let best = -1;
      for (const p of pts) {
        for (const q of pts) {
          const d = dist(p, q);
          if (d > best) {
            best = d;
            a = p;
            b = q;
          }
        }
      }
      const ux = (c.x - a.x) / (dist(a, c) || 1);
      const uy = (c.y - a.y) / (dist(a, c) || 1);
      stand = c;
      for (let inset = 300; inset <= Math.min(2200, best * 0.5); inset += 150) {
        const cand = { x: a.x + ux * inset, y: a.y + uy * inset };
        if (insideEnough(cand)) {
          stand = cand;
          break;
        }
      }
      look = b;
    }

    out.push({
      id: 'cam-' + r.id,
      label: `${r.name}から`,
      position: [stand.x / 1000, eye, stand.y / 1000],
      target: [look.x / 1000, 1.2, look.y / 1000],
      fovDeg: 65,
    });
  });
  return out;
}
