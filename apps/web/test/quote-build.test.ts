import { describe, expect, it } from 'vitest';
import { deserialize, detectRooms } from '@hiraku/core';
import { quoteTotals, renderQuote } from '@hiraku/report';
import sample from '@hiraku/core/fixtures/sample-minka.json';
import { addDaysIso, linesFromPlan, newQuote, quoteNumber } from '@/lib/quote-build';

const model = deserialize(JSON.stringify(sample));

describe('改修案から見積の明細を起こす', () => {
  const ops = [
    { op: 'change_floor', roomId: detectRooms(model.levels[0]!)[0]!.id, finishId: 'flooring' },
    { op: 'electrical', work: 'add_outlet', count: 4 },
  ] as const;

  it('分類ごとの見出しが入り、品目が続く', () => {
    const lines = linesFromPlan(model, [...ops], undefined);
    expect(lines.some((l) => l.heading)).toBe(true);
    expect(lines.some((l) => !l.heading && l.qty > 0)).toBe(true);
  });

  it('取り込んだ行は、参考レンジを覚えている', () => {
    const lines = linesFromPlan(model, [...ops], undefined);
    const item = lines.find((l) => !l.heading && !l.tbd)!;
    expect(item.fromRange).toBeTruthy();
    expect(item.edited).toBeUndefined();
  });

  it('単価は10円単位に揃う（同じ材料で単価がぶれない）', () => {
    for (const l of linesFromPlan(model, [...ops], undefined)) {
      if (l.heading || l.tbd) continue;
      expect(l.unitPrice % 10).toBe(0);
    }
  });

  it('有資格の工事があれば、施工費を別途の行として立てる', () => {
    const lines = linesFromPlan(model, [...ops], undefined);
    const tbd = lines.find((l) => l.tbd);
    expect(tbd?.name).toContain('有資格');
  });

  it('低め・中間・高めで、金額が並ぶ', () => {
    const sum = (pick: 'low' | 'mid' | 'high') =>
      linesFromPlan(model, [...ops], undefined, pick)
        .filter((l) => !l.heading && !l.tbd)
        .reduce((s, l) => s + l.qty * l.unitPrice, 0);
    expect(sum('low')).toBeLessThan(sum('mid'));
    expect(sum('mid')).toBeLessThan(sum('high'));
  });
});

describe('見積書のたたき台', () => {
  it('発行日と有効期限が入り、合計は0から始まる', () => {
    const q = newQuote({ subject: 'テスト' });
    expect(q.issuedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(q.validUntil).toBe(addDaysIso(q.issuedOn, 30));
    expect(quoteTotals(q).total).toBe(0);
    expect(q.provisional).toBe(true);
  });

  it('明細を入れると、そのまま印刷できる形になる', () => {
    const q = newQuote();
    q.clientName = '奥野 太郎';
    q.lines = linesFromPlan(model, [{ op: 'electrical', work: 'add_outlet', count: 4 }], undefined);
    const html = renderQuote(q);
    expect(html).toContain('御見積書');
    expect(html).toContain('奥野 太郎');
    expect(html).toContain('size: A4 portrait');
  });

  it('見積番号は日付から作る', () => {
    expect(quoteNumber(new Date(2026, 7, 22))).toBe('Q20260822-01');
  });
});
