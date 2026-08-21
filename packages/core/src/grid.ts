import type { SpaceModel } from './types';

/**
 * ノードをモジュール格子へスナップする。
 * measured のノードは動かさない。動いたノードは hypothesis に昇格。
 */
export function snapToGrid(model: SpaceModel, moduleMm: number, toleranceMm: number): SpaceModel {
  const next: SpaceModel = structuredClone(model);
  for (const level of next.levels) {
    for (const node of level.nodes) {
      if (node.confidence === 'measured') continue;
      const gx = Math.round(node.x / moduleMm) * moduleMm;
      const gy = Math.round(node.y / moduleMm) * moduleMm;
      const dx = Math.abs(gx - node.x);
      const dy = Math.abs(gy - node.y);
      if (dx > toleranceMm || dy > toleranceMm) continue;
      if (dx === 0 && dy === 0) continue;
      node.x = gx;
      node.y = gy;
      node.confidence = 'hypothesis';
    }
  }
  return next;
}
