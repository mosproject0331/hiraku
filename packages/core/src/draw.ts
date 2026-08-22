import type { Confidence, Level, SpaceModel } from './types';
import { dist, distToSegment, type XY } from './geometry';
import { splitWallAt } from './ops';

/**
 * 数値で図面を引くための操作。
 *
 * 実測してきた寸法をそのまま打ち込めることを目的にする。
 * 画面上でドラッグするより、巻尺の数字を入れるほうが速くて正確な場面が多い。
 * ここは純粋な計算だけを持ち、画面側の都合は持ち込まない。
 */

export interface DrawResult {
  model: SpaceModel;
  /** 新しくできた（またはつながった先の）頂点 */
  nodeId: string;
  /** 追加された壁 */
  wallIds: string[];
}

export interface DrawOptions {
  /** 壁の厚み(mm) */
  thickness?: number;
  /** この寸法の確からしさ。実測を打ち込んだなら measured */
  confidence?: Confidence;
  /** これ以内にある既存の頂点にはくっつける(mm) */
  snapMm?: number;
}

const DEFAULTS = { thickness: 120, confidence: 'measured' as Confidence, snapMm: 75 };

function ids(level: Level): Set<string> {
  const s = new Set<string>();
  for (const n of level.nodes) s.add(n.id);
  for (const w of level.walls) s.add(w.id);
  for (const o of level.openings) s.add(o.id);
  return s;
}

function freeId(taken: Set<string>, prefix: string): string {
  let i = 1;
  let id = `${prefix}${i}`;
  while (taken.has(id)) {
    i += 1;
    id = `${prefix}${i}`;
  }
  taken.add(id);
  return id;
}

/**
 * 向き(度)を単位ベクトルにする。
 * 0=右, 90=下, 180=左, 270=上。図面は画面と同じで y が下に伸びる。
 */
export function headingVector(deg: number): XY {
  const r = (deg * Math.PI) / 180;
  return { x: Math.cos(r), y: Math.sin(r) };
}

/** 2点の向き(度)。headingVector の逆 */
export function vectorHeading(a: XY, b: XY): number {
  const d = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  return (d + 360) % 360;
}

/** その位置にすでに頂点があれば、その id を返す */
function nodeAt(level: Level, p: XY, tolMm: number): string | null {
  let best: { id: string; d: number } | null = null;
  for (const n of level.nodes) {
    const d = dist(n, p);
    if (d <= tolMm && (!best || d < best.d)) best = { id: n.id, d };
  }
  return best?.id ?? null;
}

/**
 * 頂点を用意する。
 * 近くに頂点があれば使い回し、既存の壁の途中に乗るならその壁を割る。
 * 割らずに重ねると、壁が二重になって部屋の認識が壊れる。
 */
function ensureNode(
  level: Level,
  taken: Set<string>,
  p: XY,
  conf: Confidence,
  tolMm: number,
): string {
  const hit = nodeAt(level, p, tolMm);
  if (hit) return hit;

  // 壁の途中に乗っているか
  const nodeById = new Map(level.nodes.map((n) => [n.id, n] as const));
  for (const w of level.walls) {
    const a = nodeById.get(w.a);
    const b = nodeById.get(w.b);
    if (!a || !b) continue;
    if (distToSegment(p, a, b) > tolMm) continue;
    const id = freeId(taken, 'n');
    const split = splitWallAt(level, w.id, p, id);
    if (!split) {
      taken.delete(id);
      continue;
    }
    level.nodes = split.nodes;
    level.walls = split.walls;
    level.openings = split.openings;
    for (const w2 of level.walls) taken.add(w2.id);
    const made = level.nodes.find((n) => n.id === id);
    if (made) made.confidence = conf;
    return id;
  }

  const id = freeId(taken, 'n');
  level.nodes.push({ id, x: Math.round(p.x), y: Math.round(p.y), confidence: conf });
  return id;
}

/** 壁を用意する（すでに同じ2点を結ぶ壁があれば作らない） */
function ensureWall(
  level: Level,
  taken: Set<string>,
  a: string,
  b: string,
  thickness: number,
  conf: Confidence,
): string | null {
  if (a === b) return null;
  const exists = level.walls.find((w) => (w.a === a && w.b === b) || (w.a === b && w.b === a));
  if (exists) {
    // すでにある壁は、より確かな寸法で上書きする
    if (conf === 'measured') exists.confidence = 'measured';
    return null;
  }
  const id = freeId(taken, 'w');
  level.walls.push({ id, a, b, thickness, confidence: conf, structural: 'unknown' });
  return id;
}

/** 起点から、長さと向きを指定して壁を1本のばす */
export function extendWall(
  model: SpaceModel,
  fromNodeId: string,
  lengthMm: number,
  headingDeg: number,
  opts: DrawOptions = {},
): DrawResult {
  const o = { ...DEFAULTS, ...opts };
  const next = structuredClone(model);
  const level = next.levels[0];
  if (!level) return { model: next, nodeId: fromNodeId, wallIds: [] };
  const from = level.nodes.find((n) => n.id === fromNodeId);
  if (!from || !(lengthMm > 0)) return { model: next, nodeId: fromNodeId, wallIds: [] };

  const taken = ids(level);
  const u = headingVector(headingDeg);
  const target = { x: from.x + u.x * lengthMm, y: from.y + u.y * lengthMm };
  const toId = ensureNode(level, taken, target, o.confidence, o.snapMm);
  const wallId = ensureWall(level, taken, fromNodeId, toId, o.thickness, o.confidence);
  return { model: next, nodeId: toId, wallIds: wallId ? [wallId] : [] };
}

/** 起点を左上として、幅×奥行の長方形をつくる */
export function addRectangle(
  model: SpaceModel,
  origin: XY,
  widthMm: number,
  depthMm: number,
  opts: DrawOptions = {},
): DrawResult {
  const o = { ...DEFAULTS, ...opts };
  const next = structuredClone(model);
  const level = next.levels[0];
  if (!level || !(widthMm > 0) || !(depthMm > 0)) {
    return { model: next, nodeId: '', wallIds: [] };
  }
  const taken = ids(level);
  const corners: XY[] = [
    { x: origin.x, y: origin.y },
    { x: origin.x + widthMm, y: origin.y },
    { x: origin.x + widthMm, y: origin.y + depthMm },
    { x: origin.x, y: origin.y + depthMm },
  ];
  const nodeIds = corners.map((c) => ensureNode(level, taken, c, o.confidence, o.snapMm));
  const wallIds: string[] = [];
  for (let i = 0; i < 4; i++) {
    const id = ensureWall(level, taken, nodeIds[i]!, nodeIds[(i + 1) % 4]!, o.thickness, o.confidence);
    if (id) wallIds.push(id);
  }
  return { model: next, nodeId: nodeIds[0]!, wallIds };
}

/**
 * 壁の長さを数値で決め直す。
 * anchor 側の端は動かさず、反対の端を向きを保ったまま動かす。
 * 端の頂点を他の壁も使っているときは、その壁もついてくる（角が動く）。
 */
export function setWallLength(
  model: SpaceModel,
  wallId: string,
  lengthMm: number,
  anchor: 'a' | 'b' | 'center' = 'a',
): SpaceModel {
  const next = structuredClone(model);
  const level = next.levels[0];
  if (!level || !(lengthMm > 0)) return next;
  const w = level.walls.find((x) => x.id === wallId);
  if (!w) return next;
  const a = level.nodes.find((n) => n.id === w.a);
  const b = level.nodes.find((n) => n.id === w.b);
  if (!a || !b) return next;
  const cur = dist(a, b);
  if (cur < 1) return next;
  const ux = (b.x - a.x) / cur;
  const uy = (b.y - a.y) / cur;

  if (anchor === 'a') {
    b.x = Math.round(a.x + ux * lengthMm);
    b.y = Math.round(a.y + uy * lengthMm);
    b.confidence = 'measured';
  } else if (anchor === 'b') {
    a.x = Math.round(b.x - ux * lengthMm);
    a.y = Math.round(b.y - uy * lengthMm);
    a.confidence = 'measured';
  } else {
    const cx = (a.x + b.x) / 2;
    const cy = (a.y + b.y) / 2;
    a.x = Math.round(cx - (ux * lengthMm) / 2);
    a.y = Math.round(cy - (uy * lengthMm) / 2);
    b.x = Math.round(cx + (ux * lengthMm) / 2);
    b.y = Math.round(cy + (uy * lengthMm) / 2);
    a.confidence = 'measured';
    b.confidence = 'measured';
  }
  w.confidence = 'measured';
  return next;
}

/**
 * 壁を水平か垂直にそろえる。長さは測った値なので変えず、向きだけ直す。
 */
export function alignWall(model: SpaceModel, wallId: string, axis: 'h' | 'v' | 'auto' = 'auto'): SpaceModel {
  const next = structuredClone(model);
  const level = next.levels[0];
  if (!level) return next;
  const w = level.walls.find((x) => x.id === wallId);
  if (!w) return next;
  const a = level.nodes.find((n) => n.id === w.a);
  const b = level.nodes.find((n) => n.id === w.b);
  if (!a || !b) return next;
  const len = dist(a, b);
  if (len < 1) return next;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const useH = axis === 'h' || (axis === 'auto' && Math.abs(dx) >= Math.abs(dy));
  if (useH) {
    b.x = Math.round(a.x + Math.sign(dx || 1) * len);
    b.y = a.y;
  } else {
    b.x = a.x;
    b.y = Math.round(a.y + Math.sign(dy || 1) * len);
  }
  return next;
}

/** 頂点を座標で置き直す */
export function moveNode(model: SpaceModel, nodeId: string, x: number, y: number): SpaceModel {
  const next = structuredClone(model);
  const level = next.levels[0];
  const n = level?.nodes.find((v) => v.id === nodeId);
  if (n) {
    n.x = Math.round(x);
    n.y = Math.round(y);
    n.confidence = 'measured';
  }
  return next;
}

/**
 * ほぼ直角の壁を、本当に直角にそろえる。
 *
 * なぞって引いた図面はどうしても数度ずれる。壁を1本ずつ直すと角が離れてしまうので、
 * 「この壁は水平（垂直）である」という条件を全部同時に、少しずつ満たしにいく。
 * 実測として入れた頂点は動かさない。
 */
export function orthogonalize(model: SpaceModel, toleranceDeg = 14, passes = 40): SpaceModel {
  const next = structuredClone(model);
  const level = next.levels[0];
  if (!level) return next;
  const byId = new Map(level.nodes.map((n) => [n.id, n] as const));

  interface Target {
    a: string;
    b: string;
    axis: 'h' | 'v';
  }
  const targets: Target[] = [];
  for (const w of level.walls) {
    const a = byId.get(w.a);
    const b = byId.get(w.b);
    if (!a || !b) continue;
    const len = dist(a, b);
    if (len < 1) continue;
    const ang = Math.abs(((vectorHeading(a, b) % 180) + 180) % 180); // 0..180
    const offH = Math.min(ang, 180 - ang);
    const offV = Math.abs(ang - 90);
    if (offH <= toleranceDeg) targets.push({ a: w.a, b: w.b, axis: 'h' });
    else if (offV <= toleranceDeg) targets.push({ a: w.a, b: w.b, axis: 'v' });
  }
  if (!targets.length) return next;

  for (let p = 0; p < passes; p++) {
    let moved = 0;
    for (const t of targets) {
      const a = byId.get(t.a)!;
      const b = byId.get(t.b)!;
      // 水平なら y を、垂直なら x をそろえる
      const key = t.axis === 'h' ? 'y' : 'x';
      const av = a[key];
      const bv = b[key];
      if (Math.abs(av - bv) < 0.5) continue;
      const aFixed = a.confidence === 'measured';
      const bFixed = b.confidence === 'measured';
      if (aFixed && bFixed) continue;
      const mid = (av + bv) / 2;
      if (!aFixed && !bFixed) {
        a[key] = mid;
        b[key] = mid;
      } else if (aFixed) {
        b[key] = av;
      } else {
        a[key] = bv;
      }
      moved += 1;
    }
    if (!moved) break;
  }
  for (const n of level.nodes) {
    n.x = Math.round(n.x);
    n.y = Math.round(n.y);
  }
  return next;
}

/** ほとんど同じ位置にある頂点をひとつにまとめる */
export function mergeNearbyNodes(model: SpaceModel, toleranceMm = 60): SpaceModel {
  const next = structuredClone(model);
  const level = next.levels[0];
  if (!level) return next;

  const remap = new Map<string, string>();
  const kept: typeof level.nodes = [];
  for (const n of level.nodes) {
    const hit = kept.find((k) => dist(k, n) <= toleranceMm);
    if (hit) {
      remap.set(n.id, hit.id);
      // 実測の位置を優先する
      if (n.confidence === 'measured' && hit.confidence !== 'measured') {
        hit.x = n.x;
        hit.y = n.y;
        hit.confidence = 'measured';
      }
    } else {
      kept.push(n);
    }
  }
  if (!remap.size) return next;

  level.nodes = kept;
  const seen = new Set<string>();
  level.walls = level.walls.filter((w) => {
    w.a = remap.get(w.a) ?? w.a;
    w.b = remap.get(w.b) ?? w.b;
    if (w.a === w.b) return false;
    const key = [w.a, w.b].sort().join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const walls = new Set(level.walls.map((w) => w.id));
  level.openings = level.openings.filter((o) => walls.has(o.wallId));
  return next;
}
