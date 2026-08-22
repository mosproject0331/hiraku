import type { Level, RenovationOp, SpaceModel } from './types';
import { dist } from './geometry';
import { detectRooms } from './rooms';
import { findRoom, findWall } from './levels';

export interface WallQuantity {
  wallId: string;
  /** どの階の壁か */
  levelId: string;
  lengthMm: number;
  /** 開口を控除した壁面積(片面, m2) */
  areaM2: number;
}

export interface Takeoff {
  /** 部屋別床面積。階の名前つき */
  rooms: { name: string; areaM2: number; tatami: number; levelName: string }[];
  totalFloorM2: number;
  walls: WallQuantity[];
  openingCounts: Record<string, number>;
  /** ops指定時: 撤去対象の壁の面積・長さ */
  removal?: { areaM2: number; lengthMm: number };
}

function wallArea(level: Level, wallId: string): { lengthMm: number; areaM2: number } {
  const nodeById = new Map(level.nodes.map((n) => [n.id, n] as const));
  const w = level.walls.find((x) => x.id === wallId);
  if (!w) return { lengthMm: 0, areaM2: 0 };
  const a = nodeById.get(w.a);
  const b = nodeById.get(w.b);
  if (!a || !b) return { lengthMm: 0, areaM2: 0 };
  const len = dist(a, b);
  let area = (len * level.heightMm) / 1e6;
  for (const o of level.openings) {
    if (o.wallId === wallId) area -= (o.width * o.height) / 1e6;
  }
  return { lengthMm: Math.round(len), areaM2: Math.max(0, Math.round(area * 100) / 100) };
}

/** 数量拾い(§4)。全ての階を合算する */
export function takeoff(model: SpaceModel, ops?: RenovationOp[]): Takeoff {
  if (!model.levels.length) {
    return { rooms: [], totalFloorM2: 0, walls: [], openingCounts: {} };
  }
  const rooms = model.levels.flatMap((lv) =>
    detectRooms(lv).map((r) => ({ name: r.name, areaM2: r.areaM2, tatami: r.tatami, levelName: lv.name })),
  );
  const totalFloorM2 = Math.round(rooms.reduce((s, r) => s + r.areaM2, 0) * 100) / 100;
  const walls = model.levels.flatMap((lv) =>
    lv.walls.map((w) => ({ wallId: w.id, levelId: lv.id, ...wallArea(lv, w.id) })),
  );
  const openingCounts: Record<string, number> = {};
  for (const lv of model.levels) {
    for (const o of lv.openings) openingCounts[o.kind] = (openingCounts[o.kind] ?? 0) + 1;
  }

  let removal: Takeoff['removal'];
  if (ops) {
    let areaM2 = 0;
    let lengthMm = 0;
    for (const op of ops) {
      if (op.op !== 'remove_partition') continue;
      const found = findWall(model, op.wallId);
      if (!found) continue;
      const q = wallArea(found.level, op.wallId);
      areaM2 += q.areaM2;
      lengthMm += q.lengthMm;
    }
    removal = { areaM2: Math.round(areaM2 * 100) / 100, lengthMm };
  }
  return { rooms, totalFloorM2, walls, openingCounts, removal };
}

/** 部屋のwallLoopに沿った内壁面積(片面, 開口控除, m2) */
export function roomWallAreaM2(model: SpaceModel, roomId: string): number {
  const found = findRoom(model, roomId);
  if (!found) return 0;
  let area = 0;
  for (const wid of found.item.wallLoop) {
    area += wallArea(found.level, wid).areaM2;
  }
  return Math.round(area * 100) / 100;
}

/** 部屋の床面積(m2)。無ければ0 */
export function roomAreaM2(model: SpaceModel, roomId: string): number {
  return findRoom(model, roomId)?.item.areaM2 ?? 0;
}
