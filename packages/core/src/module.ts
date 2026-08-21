import type { SpaceModel } from './types';
import { dist } from './geometry';

const CANDIDATES = [910, 955] as const;
const MIN_WALL_MM = 400;
const MIN_WALLS = 3;
const TIE_MARGIN = 0.015;

function score(lengths: number[], m: number): number {
  let sum = 0;
  for (const len of lengths) {
    const r = len % m;
    sum += Math.min(r, m - r) / m;
  }
  return sum / lengths.length;
}

/** 壁長の分布から910/955のどちらが整合的か。判定不能なら910 */
export function estimateModule(model: SpaceModel): number {
  const lengths: number[] = [];
  for (const level of model.levels) {
    const nodeById = new Map(level.nodes.map((n) => [n.id, n] as const));
    for (const w of level.walls) {
      const a = nodeById.get(w.a);
      const b = nodeById.get(w.b);
      if (!a || !b) continue;
      const len = dist(a, b);
      if (len >= MIN_WALL_MM) lengths.push(len);
    }
  }
  if (lengths.length < MIN_WALLS) return 910;
  const s910 = score(lengths, CANDIDATES[0]);
  const s955 = score(lengths, CANDIDATES[1]);
  if (Math.abs(s910 - s955) < TIE_MARGIN) return 910;
  return s955 < s910 ? 955 : 910;
}
