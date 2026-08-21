import type { Level, RenovationOp, SpaceModel } from './types';
import { dist } from './geometry';
import { detectRooms } from './rooms';

export interface WallQuantity {
  wallId: string;
  lengthMm: number;
  /** 開口を控除した壁面積(片面, m2) */
  areaM2: number;
}

export interface Takeoff {
  /** 部屋別床面積 */
  rooms: { name: string; areaM2: number; tatami: number }[];
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

/** 数量拾い(§4)。1レベル目を対象とする */
export function takeoff(model: SpaceModel, ops?: RenovationOp[]): Takeoff {
  const level = model.levels[0];
  if (!level) {
    return { rooms: [], totalFloorM2: 0, walls: [], openingCounts: {} };
  }
  const rooms = detectRooms(level).map((r) => ({ name: r.name, areaM2: r.areaM2, tatami: r.tatami }));
  const totalFloorM2 = Math.round(rooms.reduce((s, r) => s + r.areaM2, 0) * 100) / 100;
  const walls = level.walls.map((w) => ({ wallId: w.id, ...wallArea(level, w.id) }));
  const openingCounts: Record<string, number> = {};
  for (const o of level.openings) openingCounts[o.kind] = (openingCounts[o.kind] ?? 0) + 1;

  let removal: Takeoff['removal'];
  if (ops) {
    let areaM2 = 0;
    let lengthMm = 0;
    for (const op of ops) {
      if (op.op === 'remove_partition') {
        const q = wallArea(level, op.wallId);
        areaM2 += q.areaM2;
        lengthMm += q.lengthMm;
      }
    }
    removal = { areaM2: Math.round(areaM2 * 100) / 100, lengthMm };
  }
  return { rooms, totalFloorM2, walls, openingCounts, removal };
}

/** 部屋のwallLoopに沿った内壁面積(片面, 開口控除, m2) */
export function roomWallAreaM2(model: SpaceModel, roomId: string): number {
  const level = model.levels[0];
  if (!level) return 0;
  const room = detectRooms(level).find((r) => r.id === roomId);
  if (!room) return 0;
  let area = 0;
  for (const wid of room.wallLoop) {
    area += wallArea(level, wid).areaM2;
  }
  return Math.round(area * 100) / 100;
}

/** 部屋の床面積(m2)。無ければ0 */
export function roomAreaM2(model: SpaceModel, roomId: string): number {
  const level = model.levels[0];
  if (!level) return 0;
  return detectRooms(level).find((r) => r.id === roomId)?.areaM2 ?? 0;
}
