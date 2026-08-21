import { describe, expect, it } from 'vitest';
import { applyOps, deserialize, detectRooms, takeoff, validateOps, type RenovationOp } from '../src/index';
import raw from '../fixtures/sample-minka.json';

function load() {
  return deserialize(JSON.stringify(raw));
}

describe('takeoff', () => {
  it('部屋別床面積と合計を返す', () => {
    const t = takeoff(load());
    expect(t.rooms).toHaveLength(5);
    expect(t.totalFloorM2).toBeCloseTo(59.62, 1);
  });

  it('壁面積は開口を控除する', () => {
    const t = takeoff(load());
    // w1: (0,0)-(2730,0) 長さ2730 高さ2400 → 6.55㎡ − 玄関(1200×2000=2.4㎡) = 4.15㎡
    const w1 = t.walls.find((w) => w.wallId === 'w1')!;
    expect(w1.areaM2).toBeCloseTo(4.15, 2);
  });

  it('撤去対象の数量を拾う', () => {
    const t = takeoff(load(), [{ op: 'remove_partition', wallId: 'w15' }]);
    expect(t.removal!.lengthMm).toBe(4550);
    expect(t.removal!.areaM2).toBeCloseTo(10.92, 2);
  });
});

describe('validateOps', () => {
  it('存在しない要素参照はerror', () => {
    const issues = validateOps(load(), [
      { op: 'remove_partition', wallId: 'nope' },
      { op: 'close_opening', openingId: 'nope' },
      { op: 'change_floor', roomId: 'nope', finishId: 'flooring' },
    ]);
    expect(issues.filter((i) => i.level === 'error')).toHaveLength(3);
  });

  it('耐力壁疑いの撤去はwarning(適用は可能)', () => {
    const issues = validateOps(load(), [{ op: 'remove_partition', wallId: 'w1' }]);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.level).toBe('warning');
    expect(issues[0]!.message).toContain('構造確認要');
  });

  it('水回り追加は経路メモ必須', () => {
    const model = load();
    const roomId = detectRooms(model.levels[0]!)[0]!.id;
    const bad: RenovationOp[] = [{ op: 'add_water_unit', roomId, unit: 'kitchen', routeNote: '' }];
    expect(validateOps(model, bad)[0]!.level).toBe('error');
    const good: RenovationOp[] = [{ op: 'add_water_unit', roomId, unit: 'kitchen', routeNote: '既存台所の直上' }];
    expect(validateOps(model, good)).toHaveLength(0);
  });
});

describe('applyOps', () => {
  it('間仕切り撤去で部屋が減り、元モデルは不変', () => {
    const model = load();
    const before = detectRooms(model.levels[0]!).length;
    const after = applyOps(model, [{ op: 'remove_partition', wallId: 'w15' }]);
    expect(detectRooms(after.levels[0]!)).toHaveLength(before - 1);
    expect(detectRooms(model.levels[0]!)).toHaveLength(before);
  });

  it('errorのあるOpはスキップされる', () => {
    const model = load();
    const after = applyOps(model, [{ op: 'remove_partition', wallId: 'nope' }]);
    expect(after.levels[0]!.walls).toHaveLength(model.levels[0]!.walls.length);
  });
});
