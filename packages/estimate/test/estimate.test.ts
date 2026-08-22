import { describe, expect, it } from 'vitest';
import { deserialize, detectRooms, type RenovationOp } from '@hiraku/core';
import { applyPriceBook, estimatePlan, parsePriceCsv, priceTemplateCsv, WORK_ITEMS } from '../src/index';
import raw from '../../core/fixtures/sample-minka.json';

function load() {
  return deserialize(JSON.stringify(raw));
}

const model = load;
const firstRoomId = () => detectRooms(load().levels[0]!)[0]!.id;

describe('工事項目マスタ', () => {
  it('どの単価にも出どころがあり、確かめたものには時点が付く', () => {
    expect(WORK_ITEMS.length).toBeGreaterThanOrEqual(38);
    for (const w of WORK_ITEMS) {
      const p = w.materialUnitPrice;
      expect(p.source, w.id).toBeTruthy();
      expect(p.low, w.id).toBeLessThanOrEqual(p.high);
      expect(w.steps.length).toBeGreaterThanOrEqual(1);
      if (p.verified) {
        // 確かめたと言うからには、いつ時点かが要る
        expect(p.asOf, w.id).toMatch(/^\d{4}-\d{2}$/);
        expect(p.source, w.id).not.toContain('未検証');
      } else {
        expect(p.source, w.id).toContain('未検証');
      }
    }
  });

  it('実売を調べた項目は、確かめた単価として入っている', () => {
    const checked = WORK_ITEMS.filter((w) => w.materialUnitPrice.verified).map((w) => w.id);
    // 調べた6項目は必ず入っていること（減ったら気づけるように）
    for (const id of ['flooring', 'cushion_floor', 'cloth', 'shikkui_diy', 'insulate-floor', 'carp-partition']) {
      expect(checked, id).toContain(id);
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

describe('単価帳（CSV取り込み）', () => {
  it('テンプレCSVを往復で解析できる', async () => {
    const { parsePriceCsv, priceTemplateCsv } = await import('../src/index');
    const { book, errors } = parsePriceCsv(priceTemplateCsv());
    expect(errors).toHaveLength(0);
    expect(Object.keys(book).length).toBe(WORK_ITEMS.length);
  });

  it('未知IDと不正な単価はエラーとして返る', async () => {
    const { parsePriceCsv } = await import('../src/index');
    const { book, errors } = parsePriceCsv(
      'id,name,low,high,source\nnope,"x",100,200,\nflooring,"床",900,100,\nflooring,"床",3500,"9,000",自社積算',
    );
    expect(errors).toHaveLength(2);
    expect(book['flooring']).toEqual({ id: 'flooring', low: 3500, high: 9000, source: '自社積算' });
  });

  it('取り込んだ単価が見積に反映され、verifiedになる', async () => {
    const { parsePriceCsv, estimatePlan } = await import('../src/index');
    const model = load();
    const rooms = detectRooms(model.levels[0]!);
    const r = rooms.find((x) => x.name === '和室A')!;
    // まだ調べていない項目で試す（調べ済みの項目は最初から verified のため）
    const base = estimatePlan(model, [{ op: 'change_ceiling', roomId: r.id, finishId: 'ceiling_board' }]);
    expect(base.lines[0]!.verified).toBe(false);
    expect(base.lines[0]!.priceSource).toContain('未検証');

    const { book } = parsePriceCsv('flooring,床,10000,10000,自社積算');
    const withBook = estimatePlan(model, [{ op: 'change_floor', roomId: r.id, finishId: 'flooring' }], book);
    expect(withBook.lines[0]!.verified).toBe(true);
    expect(withBook.lines[0]!.lowYen).toBe(Math.round((12.42 * 10000) / 100) * 100);
  });
});

describe('単価の出どころ', () => {
  it('どの単価にも、何の値段かと出どころが書いてある', () => {
    for (const w of WORK_ITEMS) {
      expect(w.materialUnitPrice.source, w.id).toBeTruthy();
      expect(['material', 'equipment', 'installed', 'service']).toContain(w.materialUnitPrice.basis);
    }
  });

  it('調べていない項目は、調べていないと分かる', () => {
    const unchecked = WORK_ITEMS.filter((w) => !w.materialUnitPrice.verified);
    expect(unchecked.length).toBeGreaterThan(0);
    for (const w of unchecked) expect(w.materialUnitPrice.source).toContain('未検証');
  });

  it('材料費でないものを材料費と呼ばない', () => {
    const byId = new Map(WORK_ITEMS.map((w) => [w.id, w] as const));
    expect(byId.get('tatami_omote')!.materialUnitPrice.basis).toBe('installed');
    expect(byId.get('demo-zanchi')!.materialUnitPrice.basis).toBe('service');
    expect(byId.get('cleaning')!.materialUnitPrice.basis).toBe('service');
    expect(byId.get('kitchen')!.materialUnitPrice.basis).toBe('equipment');
    expect(byId.get('flooring')!.materialUnitPrice.basis).toBe('material');
  });

  it('自分の単価を入れると、確かめた数字として扱われる', () => {
    const items = applyPriceBook({ flooring: { id: 'flooring', low: 4200, high: 4800, source: '○○建材 2026-08', asOf: '2026-08' } });
    const f = items.find((w) => w.id === 'flooring')!;
    expect(f.materialUnitPrice.verified).toBe(true);
    expect(f.materialUnitPrice.low).toBe(4200);
    expect(f.materialUnitPrice.source).toBe('○○建材 2026-08');
    expect(f.materialUnitPrice.asOf).toBe('2026-08');
    // 触っていない・まだ調べていない項目は未検証のまま
    expect(items.find((w) => w.id === 'ceiling_board')!.materialUnitPrice.verified).toBe(false);
  });

  it('未検証の項目は、金額の幅が大きい順に返る', () => {
    // まだ調べていない項目を含む案で確かめる
    const est = estimatePlan(model(), [
      { op: 'change_ceiling', roomId: firstRoomId(), finishId: 'ceiling_board' },
      { op: 'insulate', target: 'ceiling' },
      { op: 'electrical', work: 'lighting_diy', count: 3 },
    ]);
    expect(est.unverified.length).toBeGreaterThan(0);
    const impacts = est.unverified.map((u) => u.impactYen);
    expect([...impacts].sort((a, b) => b - a)).toEqual(impacts);
  });

  it('調べ済みの項目だけの案なら、未検証は出ない', () => {
    const est = estimatePlan(model(), [
      { op: 'change_floor', roomId: firstRoomId(), finishId: 'flooring' },
      { op: 'electrical', work: 'add_outlet', count: 4 },
    ]);
    expect(est.unverified).toEqual([]);
  });

  it('CSVは新旧どちらの並びでも読める', () => {
    const oldStyle = 'id,name,low,high,source\nflooring,"フローリング張り",4000,5000,自社';
    const newStyle = 'id,name,unit,basis,low,high,source,asOf\nflooring,"フローリング張り",㎡,material,4000,5000,自社,2026-08';
    for (const csv of [oldStyle, newStyle]) {
      const { book, errors } = parsePriceCsv(csv);
      expect(errors).toEqual([]);
      expect(book.flooring!.low).toBe(4000);
      expect(book.flooring!.high).toBe(5000);
    }
    expect(parsePriceCsv(newStyle).book.flooring!.asOf).toBe('2026-08');
  });

  it('書き出したCSVを読み戻せる', () => {
    const book = { paint: { id: 'paint', low: 700, high: 900, source: '自社', asOf: '2026-08' } };
    const round = parsePriceCsv(priceTemplateCsv(book));
    expect(round.errors).toEqual([]);
    expect(round.book.paint!.low).toBe(700);
  });
});

/**
 * 仮説の検証：
 * 「この道具の出す材料費は、世の中の相場と桁が合っている」
 *
 * 材工込みの相場は公開されている（例：フローリング張替え 6畳で6万〜18万円）。
 * 材料はそのうち3〜5割というのが一般的な内訳。
 * ここから外れたら、単価かどこかの計算が狂っているので気づけるようにする。
 */
describe('相場との突き合わせ', () => {
  it('6畳のフローリング張替えが、材工相場の材料分に収まる', () => {
    const model = load();
    const rooms = detectRooms(model.levels[0]!);
    // 12.42㎡（およそ7.5畳）の和室で測り、6畳あたりに直す
    const r = rooms.find((x) => x.name === '和室A')!;
    const est = estimatePlan(model, [{ op: 'change_floor', roomId: r.id, finishId: 'flooring' }]);
    const perM2Low = est.diyMaterial.lowYen / r.areaM2;
    const perM2High = est.diyMaterial.highYen / r.areaM2;

    // 6畳＝9.94㎡ に直したときの材料費
    const six = { low: perM2Low * 9.94, high: perM2High * 9.94 };
    // 材工相場 6万〜18万円の、材料分（3〜5割）＝1.8万〜9万円
    const marketMaterialLow = 60000 * 0.3;
    const marketMaterialHigh = 180000 * 0.5;

    // 下限は、相場の材料分の下限を大きく超えていないこと
    expect(six.low).toBeLessThan(marketMaterialHigh);
    expect(six.low).toBeGreaterThan(marketMaterialLow * 0.6);
    // 上限は、無垢材まで含むので相場を超えてよいが、桁は外さない
    expect(six.high).toBeLessThan(marketMaterialHigh * 3);
  });

  it('クロスと漆喰の材料費が、実売から出した幅に収まる', () => {
    const model = load();
    const rooms = detectRooms(model.levels[0]!);
    const r = rooms.find((x) => x.name === '和室A')!;
    for (const [finishId, low, high] of [
      ['cloth', 350, 2000],
      ['shikkui_diy', 1800, 4500],
    ] as const) {
      const est = estimatePlan(model, [{ op: 'change_wall_finish', roomId: r.id, finishId }]);
      const wallM2 = est.lines[0]!.qty;
      expect(est.diyMaterial.lowYen / wallM2, finishId).toBeGreaterThan(low * 0.9);
      expect(est.diyMaterial.highYen / wallM2, finishId).toBeLessThan(high * 1.1);
    }
  });
});

describe('種別と担い手の整合', () => {
  it('施工込みの単価は、専門工事の側に置く（DIY材料費に混ぜない）', () => {
    for (const w of WORK_ITEMS) {
      if (w.materialUnitPrice.basis !== 'installed') continue;
      expect(['licensed', 'pro_recommended', 'permit_related'], w.id).toContain(w.diyClass);
    }
  });

  it('材料のみの単価は、自分で動かせる側にある', () => {
    for (const w of WORK_ITEMS) {
      if (w.materialUnitPrice.basis !== 'material') continue;
      expect(['diy', 'diy_hard', 'pro_recommended'], w.id).toContain(w.diyClass);
    }
  });
});
