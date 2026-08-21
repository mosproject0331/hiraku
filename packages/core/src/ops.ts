import type { Level, RenovationOp, SpaceModel } from './types';
import { detectRooms } from './rooms';
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
  const level = model.levels[0];
  if (!level) return [{ index: -1, level: 'error', message: 'モデルにレベルがありません' }];
  const rooms = detectRooms(level);
  const wallIds = new Set(level.walls.map((w) => w.id));
  const openingIds = new Set(level.openings.map((o) => o.id));
  const roomIds = new Set(rooms.map((r) => r.id));

  ops.forEach((op, i) => {
    switch (op.op) {
      case 'remove_partition': {
        if (!wallIds.has(op.wallId)) {
          issues.push({ index: i, level: 'error', message: `存在しない壁を撤去しようとしています(${op.wallId})` });
          break;
        }
        const w = level.walls.find((x) => x.id === op.wallId)!;
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
        const w = level.walls.find((x) => x.id === op.wallId)!;
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
function oid(prefix: string): string {
  opSeq += 1;
  return prefix + '_op' + opSeq;
}

/** Op列を適用した新モデルを返す(イミュータブル)。errorのあるOpはスキップ */
export function applyOps(model: SpaceModel, ops: RenovationOp[]): SpaceModel {
  const issues = validateOps(model, ops);
  const errored = new Set(issues.filter((i) => i.level === 'error').map((i) => i.index));
  const next = structuredClone(model);
  const level: Level = next.levels[0]!;

  ops.forEach((op, i) => {
    if (errored.has(i)) return;
    switch (op.op) {
      case 'remove_partition':
        level.walls = level.walls.filter((w) => w.id !== op.wallId);
        level.openings = level.openings.filter((o) => o.wallId !== op.wallId);
        break;
      case 'add_partition': {
        const na = { id: oid('n'), x: op.a.x, y: op.a.y, confidence: 'hypothesis' as const };
        const nb = { id: oid('n'), x: op.b.x, y: op.b.y, confidence: 'hypothesis' as const };
        level.nodes.push(na, nb);
        level.walls.push({
          id: oid('w'), a: na.id, b: nb.id, thickness: 120,
          confidence: 'hypothesis', structural: 'unknown',
        });
        break;
      }
      case 'add_opening':
        level.openings.push({
          id: oid('o'), wallId: op.wallId, offset: op.offset, width: op.width,
          height: op.height, sillHeight: op.sillHeight, kind: op.kind, confidence: 'hypothesis',
        });
        break;
      case 'close_opening':
        level.openings = level.openings.filter((o) => o.id !== op.openingId);
        break;
      default:
        // 仕上げ・設備系は幾何を変えない
        break;
    }
  });
  for (const lv of next.levels) lv.rooms = detectRooms(lv);
  return next;
}
