import type { Level, Room, SpaceModel, Wall } from './types';
import { detectRooms } from './rooms';

/**
 * 階をまたいで扱うための道具。
 *
 * これまでは一階しか見ていなかった（levels[0] 固定）。
 * 空き家の多くは二階建てなので、id が階をまたいでも重ならないこと、
 * 壁や部屋を id から引けることを、ここに集める。
 */

/** その模型で使われている id をすべて集める */
export function usedIds(model: SpaceModel): Set<string> {
  const s = new Set<string>();
  for (const lv of model.levels) {
    s.add(lv.id);
    for (const n of lv.nodes) s.add(n.id);
    for (const w of lv.walls) s.add(w.id);
    for (const o of lv.openings) s.add(o.id);
  }
  return s;
}

/** まだ使われていない id をつくる。階をまたいでも重ならない */
export function nextFreeId(model: SpaceModel, prefix: string, taken?: Set<string>): string {
  const used = taken ?? usedIds(model);
  let i = 1;
  let id = `${prefix}${i}`;
  while (used.has(id)) {
    i += 1;
    id = `${prefix}${i}`;
  }
  used.add(id);
  return id;
}

export interface Located<T> {
  level: Level;
  levelIndex: number;
  item: T;
}

export function findWall(model: SpaceModel, wallId: string): Located<Wall> | null {
  for (let i = 0; i < model.levels.length; i++) {
    const lv = model.levels[i]!;
    const w = lv.walls.find((x) => x.id === wallId);
    if (w) return { level: lv, levelIndex: i, item: w };
  }
  return null;
}

export function findOpeningLevel(model: SpaceModel, openingId: string): Located<Level> | null {
  for (let i = 0; i < model.levels.length; i++) {
    const lv = model.levels[i]!;
    if (lv.openings.some((o) => o.id === openingId)) return { level: lv, levelIndex: i, item: lv };
  }
  return null;
}

/** すべての階の部屋。どの階のものかが分かる形で返す */
export function allRooms(model: SpaceModel): { levelIndex: number; level: Level; room: Room }[] {
  const out: { levelIndex: number; level: Level; room: Room }[] = [];
  model.levels.forEach((level, levelIndex) => {
    for (const room of detectRooms(level)) out.push({ levelIndex, level, room });
  });
  return out;
}

export function findRoom(model: SpaceModel, roomId: string): Located<Room> | null {
  for (const { levelIndex, level, room } of allRooms(model)) {
    if (room.id === roomId) return { level, levelIndex, item: room };
  }
  return null;
}

/** 階の名前をつける。1階・2階・3階…、下は地下 */
export function levelName(index: number): string {
  if (index === 0) return '1階';
  return `${index + 1}階`;
}

/**
 * 階を足す。
 * 上の階は下の階の外周を写して始める——最初から白紙よりも、なぞるほうが早い。
 */
export function addLevel(model: SpaceModel, copyOutlineFrom?: number): SpaceModel {
  const next = structuredClone(model);
  const index = next.levels.length;
  const taken = usedIds(next);
  const level: Level = {
    id: nextFreeId(next, 'L', taken),
    name: levelName(index),
    heightMm: next.levels[0]?.heightMm ?? 2400,
    walls: [],
    nodes: [],
    openings: [],
    rooms: [],
  };

  const src = copyOutlineFrom !== undefined ? next.levels[copyOutlineFrom] : undefined;
  if (src) {
    // 節点と壁を、新しい id で写す
    const map = new Map<string, string>();
    for (const n of src.nodes) {
      const id = nextFreeId(next, 'n', taken);
      map.set(n.id, id);
      level.nodes.push({ ...n, id, confidence: 'hypothesis' });
    }
    for (const w of src.walls) {
      const a = map.get(w.a);
      const b = map.get(w.b);
      if (!a || !b) continue;
      level.walls.push({
        ...w,
        id: nextFreeId(next, 'w', taken),
        a,
        b,
        confidence: 'hypothesis',
      });
    }
  }

  level.rooms = detectRooms(level);
  next.levels.push(level);
  return next;
}

/** 階を外す。1階は外せない */
export function removeLevel(model: SpaceModel, index: number): SpaceModel {
  if (index <= 0 || index >= model.levels.length) return model;
  const next = structuredClone(model);
  next.levels.splice(index, 1);
  next.levels.forEach((lv, i) => {
    lv.name = levelName(i);
  });
  return next;
}

/** 全階の床面積(㎡) */
export function totalFloorAreaM2(model: SpaceModel): number {
  const sum = allRooms(model).reduce((s, r) => s + r.room.areaM2, 0);
  return Math.round(sum * 100) / 100;
}

/**
 * その階の床の高さ(m)。下の階を積み上げた分。
 *
 * 3Dの組み立てとカメラの高さで別々に計算していたせいで、
 * 2階を見るとカメラが1階の高さに残る不具合が出た。ここ1か所にまとめる。
 */
export function levelBaseY(model: SpaceModel, levelIndex: number): number {
  const li = Math.min(Math.max(levelIndex, 0), model.levels.length - 1);
  return model.levels
    .slice(0, li)
    .reduce((y, lv) => y + (lv.heightMm ?? 2400) / 1000 + FLOOR_BUILDUP_M, 0);
}

/** 階と階のあいだの床組のぶん(m) */
export const FLOOR_BUILDUP_M = 0.32;
