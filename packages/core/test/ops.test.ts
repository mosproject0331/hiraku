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

describe('splitWallAt', () => {
  it('壁が2本に分かれ、新ノードが挿入される', async () => {
    const { splitWallAt } = await import('../src/index');
    const model = load();
    const level = model.levels[0]!;
    // w15: (5460,910)-(5460,5460) を中央で分割
    const next = splitWallAt(level, 'w15', { x: 5460, y: 3185 }, 'nx1');
    expect(next).not.toBeNull();
    expect(next!.walls).toHaveLength(level.walls.length + 1);
    const nn = next!.nodes.find((n) => n.id === 'nx1')!;
    expect(nn.y).toBe(3185);
    // 分割後も部屋数は変わらない(トポロジー等価)
    expect(detectRooms(next!)).toHaveLength(detectRooms(level).length);
  });

  it('開口は分割位置でどちらかの壁に割り振られoffsetが付け替わる', async () => {
    const { splitWallAt } = await import('../src/index');
    const level = load().levels[0]!;
    // w1: (0,0)-(2730,0) 玄関o1(offset760,width1200,中点1360)。cut=2000で分割→o1は前半に残る
    const next = splitWallAt(level, 'w1', { x: 2000, y: 0 }, 'nx2')!;
    const o1 = next.openings.find((o) => o.id === 'o1')!;
    expect(o1.wallId).toBe('w1');
    // cut=1000で分割→o1(中点1360)は後半へ移り offset=760-1000→0にクランプ...ではなく360
    const next2 = splitWallAt(level, 'w1', { x: 1000, y: 0 }, 'nx3')!;
    const o1b = next2.openings.find((o) => o.id === 'o1')!;
    expect(o1b.wallId).toBe('w1_s');
    expect(o1b.offset).toBe(0);
  });

  it('端に近すぎる分割はnull', async () => {
    const { splitWallAt } = await import('../src/index');
    const level = load().levels[0]!;
    expect(splitWallAt(level, 'w15', { x: 5460, y: 950 }, 'nx4')).toBeNull();
  });
});

describe('splitWallAt 連続分割', () => {
  it('同じ壁系列を2回分割してもIDが衝突しない', async () => {
    const { splitWallAt } = await import('../src/index');
    const level = load().levels[0]!;
    const once = splitWallAt(level, 'w15', { x: 5460, y: 2000 }, 'na')!;
    const twice = splitWallAt(once, 'w15', { x: 5460, y: 1500 }, 'nb')!;
    const ids = twice.walls.map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
