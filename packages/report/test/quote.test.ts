import { describe, expect, it } from 'vitest';
import { lineAmount, quoteCsv, quoteTotals, renderQuote, untouchedLines, jpDate, type QuoteDoc } from '../src/index';

function doc(over: Partial<QuoteDoc> = {}): QuoteDoc {
  return {
    no: 'Q-2026-001',
    issuedOn: '2026-08-22',
    validUntil: '2026-09-21',
    clientName: '奥野 太郎',
    clientHonorific: '様',
    subject: '空き家改修工事（土間のカフェ化）',
    site: '兵庫県三田市<script>',
    period: '着工より約6週間',
    payment: '着手時50% / 完了時50%',
    from: { name: 'ISHIZUE合同会社', tel: '000-0000-0000', person: '建石 大貴', invoiceNo: 'T1234567890123' },
    lines: [
      { id: 'h1', name: '内装工事', heading: true, qty: 0, unit: '', unitPrice: 0 },
      { id: 'l1', name: '床フローリング張り', spec: '土間 22.4㎡', qty: 22.4, unit: '㎡', unitPrice: 6000 },
      { id: 'l2', name: '壁 漆喰塗り', qty: 48, unit: '㎡', unitPrice: 2500, fromRange: { low: 100000, high: 140000 } },
      { id: 'l3', name: '給排水の接続', qty: 1, unit: '式', unitPrice: 0, tbd: true, note: '指定工事店' },
    ],
    overheadPct: 10,
    overheadLabel: '諸経費',
    discount: 4000,
    taxMode: 'exclusive',
    taxRate: 0.1,
    taxRounding: 'floor',
    notes: '別途工事: 電気の増設、家具',
    provisional: true,
    ...over,
  };
}

describe('見積書の計算', () => {
  it('見出し行と別途行は金額に入らない', () => {
    const d = doc();
    expect(lineAmount(d.lines[0]!)).toBe(0);
    expect(lineAmount(d.lines[3]!)).toBe(0);
    expect(lineAmount(d.lines[1]!)).toBe(134400);
  });

  it('小計・諸経費・値引・消費税の順で積み上げる', () => {
    const t = quoteTotals(doc());
    expect(t.subtotal).toBe(134400 + 120000);
    expect(t.overhead).toBe(25440);
    expect(t.discount).toBe(4000);
    expect(t.net).toBe(275840);
    expect(t.tax).toBe(27584);
    expect(t.total).toBe(303424);
    expect(t.tbdCount).toBe(1);
  });

  it('消費税の端数は切り捨てを既定にする', () => {
    const t = quoteTotals(doc({ lines: [{ id: 'a', name: 'x', qty: 1, unit: '式', unitPrice: 1005 }], overheadPct: 0, discount: 0 }));
    expect(t.tax).toBe(100); // 100.5 -> 100
  });

  it('内税のときは合計から割り戻す', () => {
    const t = quoteTotals(doc({ taxMode: 'inclusive', lines: [{ id: 'a', name: 'x', qty: 1, unit: '式', unitPrice: 11000 }], overheadPct: 0, discount: 0 }));
    expect(t.total).toBe(11000);
    expect(t.net).toBe(10000);
    expect(t.tax).toBe(1000);
  });

  it('非課税のときは税を足さない', () => {
    const t = quoteTotals(doc({ taxMode: 'none' }));
    expect(t.tax).toBe(0);
    expect(t.total).toBe(t.net);
  });

  it('単価を直していない取り込み行を見つけられる', () => {
    expect(untouchedLines(doc()).map((l) => l.id)).toEqual(['l2']);
    const edited = doc();
    edited.lines[2]!.edited = true;
    expect(untouchedLines(edited)).toHaveLength(0);
  });
});

describe('見積書のHTML', () => {
  it('表題・宛名・合計・明細が入り、差し込みは無害化される', () => {
    const html = renderQuote(doc());
    expect(html).toContain('御見積書');
    expect(html).toContain('奥野 太郎');
    expect(html).toContain('様');
    expect(html).toContain('¥303,424');
    expect(html).toContain('床フローリング張り');
    expect(html).toContain('別途');
    expect(html).toContain('2026年8月22日');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('A4で印刷する指定が入っている', () => {
    expect(renderQuote(doc())).toContain('size: A4 portrait');
  });

  it('概算の断りは指定したときだけ出る', () => {
    expect(renderQuote(doc())).toContain('本書は概算です');
    expect(renderQuote(doc({ provisional: false }))).not.toContain('本書は概算です');
  });

  it('文字列の連結が本文に漏れていない', () => {
    expect(renderQuote(doc())).not.toContain("' +");
  });
});

describe('CSV', () => {
  it('BOM付きで、合計行まで出す', () => {
    const csv = quoteCsv(doc());
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('"床フローリング張り"');
    expect(csv).toContain('"合計","","","","","303424"'.slice(0, 10));
    expect(csv.split('\r\n').length).toBeGreaterThan(6);
  });
});

describe('日付', () => {
  it('和暦ではなく西暦の日本語表記にする', () => {
    expect(jpDate('2026-08-22')).toBe('2026年8月22日');
    expect(jpDate(undefined)).toBe('');
  });
});

describe('明細の番号', () => {
  it('見出し行には番号を振らない', () => {
    const html = renderQuote(doc());
    const nums = [...html.matchAll(/<td class="c">(\d+)<\/td>/g)].map((m) => Number(m[1]));
    expect(nums).toEqual([1, 2, 3]);
  });

  it('CSVでも見出しの番号は空にする', () => {
    const rows = quoteCsv(doc()).split('\r\n');
    expect(rows[1]).toMatch(/^"","内装工事"/);
    expect(rows[2]).toMatch(/^"1","床フローリング張り"/);
  });
});
