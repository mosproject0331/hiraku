import { describe, expect, it } from 'vitest';
import { deserialize, detectRooms, type RenovationOp } from '@hiraku/core';
import { estimatePlan, WORK_ITEMS } from '../src/index';
import raw from '../../core/fixtures/sample-minka.json';

function load() {
  return deserialize(JSON.stringify(raw));
}

describe('工事項目マスタ', () => {
  it('40項目・単価はすべてverified:false', () => {
    expect(WORK_ITEMS.length).toBeGreaterThanOrEqual(38);
    for (const w of WORK_ITEMS) {
      expect(w.materialUnitPrice.verified).toBe(false);
      expect(w.materialUnitPrice.low).toBeLessThanOrEqual(w.materialUnitPrice.high);
      expect(w.steps.length).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('estimatePlan', () => {
  it('間仕切り撤去: 数量=開口控除後の壁面積、DIY区分に載る', () => {
    const model = load();
    const est = estimatePlan(model, [{ op: 'remove_partition', wallId: 'w15' }]);
    expect(est.lines).toHaveLength(1);
    expect(est.lines[0]!.qty).toBeCloseTo(10.92, 2);
    expect(est.diyMaterial.lowYen).toBeGreaterThan(0);
    expect(est.proMaterial.lowYen).toBe(0);
  });

  it('耐力壁疑いの撤去には構造警告が乗る(§2-4)', () => {
    const model = load();
    const est = estimatePlan(model, [{ op: 'remove_partition', wallId: 'w1' }]);
    expect(est.lines[0]!.structuralWarning).toContain('構造確認要');
  });

  it('床仕上げ: 部屋面積で数量が決まる', () => {
    const model = load();
    const rooms = detectRooms(model.levels[0]!);
    const washitu = rooms.find((r) => r.name === '和室A')!;
    const est = estimatePlan(model, [{ op: 'change_floor', roomId: washitu.id, finishId: 'flooring' }]);
    expect(est.lines[0]!.qty).toBeCloseTo(12.42, 2);
  });

  it('水回り追加: 本体(プロ)+給排水(有資格)が並び、許可フラグが立つ', () => {
    const model = load();
    const doma = detectRooms(model.levels[0]!).find((r) => r.name === '土間')!;
    const ops: RenovationOp[] = [
      { op: 'add_water_unit', roomId: doma.id, unit: 'kitchen', routeNote: '既存台所の近く' },
    ];
    const est = estimatePlan(model, ops);
    expect(est.lines).toHaveLength(2);
    expect(est.proMaterial.lowYen).toBeGreaterThan(0);
    expect(est.permitFlags.join()).toContain('指定');
  });

  it('電気: 有資格(コンセント)とDIY(照明)が区分される', () => {
    const model = load();
    const est = estimatePlan(model, [
      { op: 'electrical', work: 'add_outlet', count: 4 },
      { op: 'electrical', work: 'lighting_diy', count: 3 },
    ]);
    const outlet = est.lines.find((l) => l.itemId === 'outlet')!;
    expect(outlet.qty).toBe(4);
    expect(outlet.diyClass).toBe('licensed');
    expect(est.lines.find((l) => l.itemId === 'lighting_diy')!.diyClass).toBe('diy');
  });

  it('errorになったOpは見積に載らない', () => {
    const model = load();
    const est = estimatePlan(model, [{ op: 'remove_partition', wallId: 'nope' }]);
    expect(est.lines).toHaveLength(0);
    expect(est.issues.some((i) => i.level === 'error')).toBe(true);
  });
});
