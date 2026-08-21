import type { Measurement, SpaceModel } from './types';
import { dist } from './geometry';
import { detectRooms, detectFaces } from './rooms';

/**
 * 実測値をハード制約、推定値をソフト制約として反復調整する(§4)。
 * 厳密な最小二乗ではなく、測定ごとに自由なノードを軸方向へ動かす逐次調整。
 * 適用後、対象ノード・壁・開口の確度を measured に更新する。
 */
export function solveConstraints(model: SpaceModel, measurements: Measurement[]): SpaceModel {
  const next = structuredClone(model);
  const level = next.levels[0];
  if (!level) return next;
  const nodeById = new Map(level.nodes.map((n) => [n.id, n] as const));

  const ITER = 12;
  for (let it = 0; it < ITER; it++) {
    for (const m of measurements) {
      if (m.type === 'ceilingHeight') {
        level.heightMm = m.valueMm;
        continue;
      }
      if (m.type === 'openingWidth') {
        const o = level.openings.find((x) => x.id === m.targetIds[0]);
        if (o) {
          o.width = m.valueMm;
          o.confidence = 'measured';
        }
        continue;
      }
      if (m.type === 'tilt') continue; // 記録のみ

      // wallLength: targetIds=[wallId] / diagonal: targetIds=[nodeA, nodeB]
      let aId: string | undefined;
      let bId: string | undefined;
      if (m.type === 'wallLength') {
        const w = level.walls.find((x) => x.id === m.targetIds[0]);
        if (!w) continue;
        aId = w.a;
        bId = w.b;
      } else {
        aId = m.targetIds[0];
        bId = m.targetIds[1];
      }
      const a = aId ? nodeById.get(aId) : undefined;
      const b = bId ? nodeById.get(bId) : undefined;
      if (!a || !b) continue;
      const cur = dist(a, b);
      if (cur < 1) continue;
      const err = m.valueMm - cur;
      if (Math.abs(err) < 0.5) continue;
      const ux = (b.x - a.x) / cur;
      const uy = (b.y - a.y) / cur;
      const aFixed = a.confidence === 'measured';
      const bFixed = b.confidence === 'measured';
      if (aFixed && bFixed) continue; // どちらも確定済みなら動かさない(矛盾は残差として残る)
      if (aFixed) {
        b.x += ux * err;
        b.y += uy * err;
      } else if (bFixed) {
        a.x -= ux * err;
        a.y -= uy * err;
      } else {
        a.x -= (ux * err) / 2;
        a.y -= (uy * err) / 2;
        b.x += (ux * err) / 2;
        b.y += (uy * err) / 2;
      }
    }
  }

  // 確度更新: 測定対象のノード・壁を measured に
  for (const m of measurements) {
    if (m.type === 'wallLength') {
      const w = level.walls.find((x) => x.id === m.targetIds[0]);
      if (w) {
        w.confidence = 'measured';
        const a = nodeById.get(w.a);
        const b = nodeById.get(w.b);
        if (a) a.confidence = 'measured';
        if (b) b.confidence = 'measured';
      }
    } else if (m.type === 'diagonal') {
      for (const id of m.targetIds) {
        const n = nodeById.get(id);
        if (n) n.confidence = 'measured';
      }
    }
  }
  // 座標を丸める
  for (const n of level.nodes) {
    n.x = Math.round(n.x);
    n.y = Math.round(n.y);
  }
  for (const lv of next.levels) lv.rooms = detectRooms(lv);
  return next;
}

export interface MeasureSuggestion {
  kind: 'wall' | 'diagonal';
  targetIds: string[];
  label: string;
  reason: string;
}

/** 計測ナビ(§5-M5): 次に測ると効く場所をヒューリスティクスで提案 */
export function suggestNextMeasurements(model: SpaceModel, measurements: Measurement[]): MeasureSuggestion[] {
  const level = model.levels[0];
  if (!level) return [];
  const measuredWalls = new Set(
    measurements.filter((m) => m.type === 'wallLength').map((m) => m.targetIds[0]),
  );
  const nodeById = new Map(level.nodes.map((n) => [n.id, n] as const));
  const degree = new Map<string, number>();
  for (const w of level.walls) {
    degree.set(w.a, (degree.get(w.a) ?? 0) + 1);
    degree.set(w.b, (degree.get(w.b) ?? 0) + 1);
  }
  const candidates = level.walls
    .filter((w) => !measuredWalls.has(w.id) && w.confidence !== 'measured')
    .map((w) => {
      const a = nodeById.get(w.a);
      const b = nodeById.get(w.b);
      const len = a && b ? dist(a, b) : 0;
      const score = len * ((degree.get(w.a) ?? 1) + (degree.get(w.b) ?? 1));
      return { w, len, score };
    })
    .sort((p, q) => q.score - p.score)
    .slice(0, 3)
    .map(({ w, len }) => ({
      kind: 'wall' as const,
      targetIds: [w.id],
      label: `壁(${(len / 1000).toFixed(2)}m)を測る`,
      reason: '長く、多くの壁とつながっているため、1本で全体が締まります',
    }));

  // 最大の部屋の対角を1本
  const faces = detectFaces(level);
  const suggestions: MeasureSuggestion[] = [...candidates];
  const hasDiagonal = measurements.some((m) => m.type === 'diagonal');
  if (!hasDiagonal && faces.length > 0) {
    const f = faces[0]!;
    const ids = f.nodeIds;
    if (ids.length >= 4) {
      const aId = ids[0]!;
      const cId = ids[Math.floor(ids.length / 2)]!;
      suggestions.push({
        kind: 'diagonal',
        targetIds: [aId, cId],
        label: '一番大きな部屋の対角を測る',
        reason: '対角1本で「直角のゆがみ」が分かります',
      });
    }
  }
  return suggestions;
}
