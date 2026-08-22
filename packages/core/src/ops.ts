import type { Level, RenovationOp, SpaceModel } from './types';
import { detectRooms } from './rooms';
import { allRooms, findWall, findOpeningLevel, nextFreeId, usedIds } from './levels';
import { dist } from './geometry';

export interface OpIssue {
  index: number;
  level: 'error' | 'warning';
  message: string;
}

const FINISH_IDS = new Set([
  'flooring', 'cushion_floor', 'tatami_omote', 'cloth', 'shikkui_diy', 'paint',
  'ceiling_paint', 'ceiling_board',
]);

/** 改修Opの適用可否チェック(§4)。errorは適用不可、warningは適用可だがレポートに必ず載せる */
export function validateOps(model: SpaceModel, ops: RenovationOp[]): OpIssue[] {
  const issues: OpIssue[] = [];
  if (!model.levels.length) return [{ index: -1, level: 'error', message: 'モデルにレベルがありません' }];
  // 階をまたいで探す。2階の壁を撤去する案も通す
  const wallIds = new Set(model.levels.flatMap((lv) => lv.walls.map((w) => w.id)));
  const openingIds = new Set(model.levels.flatMap((lv) => lv.openings.map((o) => o.id)));
  const roomIds = new Set(allRooms(model).map((r) => r.room.id));

  ops.forEach((op, i) => {
    switch (op.op) {
      case 'remove_partition': {
        if (!wallIds.has(op.wallId)) {
          issues.push({ index: i, level: 'error', message: `存在しない壁を撤去しようとしています(${op.wallId})` });
          break;
        }
        const w = findWall(model, op.wallId)!.item;
        if (w.structural === 'suspected') {
          issues.push({
            index: i,
            level: 'warning',
            message: 'この壁は耐力壁の疑いがあります。撤去の可否は現地で専門家の確認が必要です(構造確認要)',
          });
        }
        break;
      }
      case 'add_partition': {
        const len = dist(op.a, op.b);
        if (len < 300) issues.push({ index: i, level: 'error', message: '間仕切りが短すぎます(300mm未満)' });
        break;
      }
      case 'add_opening': {
        if (!wallIds.has(op.wallId)) {
          issues.push({ index: i, level: 'error', message: `存在しない壁に開口を設けようとしています(${op.wallId})` });
          break;
        }
        const w = findWall(model, op.wallId)!.item;
        if (w.structural === 'suspected') {
          issues.push({
            index: i,
            level: 'warning',
            message: '開口を設ける壁に耐力壁の疑いがあります。可否は専門家確認が必要です(構造確認要)',
          });
        }
        break;
      }
      case 'close_opening':
        if (!openingIds.has(op.openingId)) {
          issues.push({ index: i, level: 'error', message: `存在しない開口です(${op.openingId})` });
        }
        break;
      case 'change_floor':
      case 'change_wall_finish':
      case 'change_ceiling':
        if (!roomIds.has(op.roomId)) {
          issues.push({ index: i, level: 'error', message: `存在しない部屋です(${op.roomId})` });
        }
        if (!FINISH_IDS.has(op.finishId)) {
          issues.push({ index: i, level: 'error', message: `未知の仕上げです(${op.finishId})` });
        }
        break;
      case 'add_water_unit':
        if (!roomIds.has(op.roomId)) {
          issues.push({ index: i, level: 'error', message: `存在しない部屋です(${op.roomId})` });
        }
        if (!op.routeNote || !op.routeNote.trim()) {
          issues.push({ index: i, level: 'error', message: '水回りの追加には給排水経路のメモが必要です' });
        }
        break;
      case 'insulate':
        if (op.roomId && !roomIds.has(op.roomId)) {
          issues.push({ index: i, level: 'error', message: `存在しない部屋です(${op.roomId})` });
        }
        break;
      case 'electrical':
        if (op.count < 1) issues.push({ index: i, level: 'error', message: '数量は1以上にしてください' });
        break;
    }
  });
  return issues;
}

let opSeq = 0;

/** Op列を適用した新モデルを返す(イミュータブル)。errorのあるOpはスキップ */
export function applyOps(model: SpaceModel, ops: RenovationOp[], levelIndex = 0): SpaceModel {
  const issues = validateOps(model, ops);
  const errored = new Set(issues.filter((i) => i.level === 'error').map((i) => i.index));
  const next = structuredClone(model);
  if (!next.levels.length) return next;
  const taken = usedIds(next);
  /** 対象がある階を返す。無ければ指定された階 */
  const levelOf = (id?: string): Level => {
    if (id) {
      const w = findWall(next, id);
      if (w) return w.level;
      const o = findOpeningLevel(next, id);
      if (o) return o.level;
    }
    return next.levels[Math.min(levelIndex, next.levels.length - 1)]!;
  };

  ops.forEach((op, i) => {
    if (errored.has(i)) return;
    switch (op.op) {
      case 'remove_partition': {
        const level = levelOf(op.wallId);
        level.walls = level.walls.filter((w) => w.id !== op.wallId);
        level.openings = level.openings.filter((o) => o.wallId !== op.wallId);
        break;
      }
      case 'add_partition': {
        const level = levelOf();
        const na = { id: nextFreeId(next, 'n', taken), x: op.a.x, y: op.a.y, confidence: 'hypothesis' as const };
        const nb = { id: nextFreeId(next, 'n', taken), x: op.b.x, y: op.b.y, confidence: 'hypothesis' as const };
        level.nodes.push(na, nb);
        level.walls.push({
          id: nextFreeId(next, 'w', taken), a: na.id, b: nb.id, thickness: 120,
          confidence: 'hypothesis', structural: 'unknown',
        });
        break;
      }
      case 'add_opening': {
        const level = levelOf(op.wallId);
        level.openings.push({
          id: nextFreeId(next, 'o', taken), wallId: op.wallId, offset: op.offset, width: op.width,
          height: op.height, sillHeight: op.sillHeight, kind: op.kind, confidence: 'hypothesis',
        });
        break;
      }
      case 'close_opening': {
        const level = levelOf(op.openingId);
        level.openings = level.openings.filter((o) => o.id !== op.openingId);
        break;
      }
      default:
        // 仕上げ・設備系は幾何を変えない
        break;
    }
  });
  for (const lv of next.levels) lv.rooms = detectRooms(lv);
  return next;
}

/**
 * 壁を点pの足元で2本に分割し、新ノードを挿入した新しいLevelを返す。
 * 端に近すぎる(100mm未満)・壁が見つからない場合はnull。
 * 開口は中点がどちら側にあるかで割り振り、offsetを付け替える。
 */
export function splitWallAt(
  level: Level,
  wallId: string,
  p: { x: number; y: number },
  newNodeId: string,
): Level | null {
  const wall = level.walls.find((w) => w.id === wallId);
  if (!wall) return null;
  const a = level.nodes.find((n) => n.id === wall.a);
  const b = level.nodes.find((n) => n.id === wall.b);
  if (!a || !b) return null;
  const len = dist(a, b);
  if (len < 200) return null;
  const t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / (len * len);
  const cut = t * len;
  if (cut < 100 || cut > len - 100) return null;
  const foot = {
    x: Math.round(a.x + (b.x - a.x) * t),
    y: Math.round(a.y + (b.y - a.y) * t),
  };
  const next: Level = structuredClone(level);
  const w = next.walls.find((x) => x.id === wallId)!;
  next.nodes.push({ id: newNodeId, x: foot.x, y: foot.y, confidence: 'measured' });
  let w2Id = wallId + '_s';
  while (next.walls.some((x) => x.id === w2Id)) w2Id += 's';
  next.walls.push({ ...structuredClone(w), id: w2Id, a: newNodeId, b: w.b });
  w.b = newNodeId;
  for (const o of next.openings) {
    if (o.wallId !== wallId) continue;
    const mid = o.offset + o.width / 2;
    if (mid > cut) {
      o.wallId = w2Id;
      o.offset = Math.max(0, Math.round(o.offset - cut));
    }
  }
  return next;
}
