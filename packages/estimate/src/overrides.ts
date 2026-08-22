import { WORK_ITEMS, type WorkItem } from './data/work-items';

export interface PriceOverride {
  id: string;
  low: number;
  high: number;
  /** 出所メモ（積算シート名など） */
  source?: string;
}

export type PriceBook = Record<string, PriceOverride>;

/** CSV（id,name,low,high,source）を解析する。ヘッダ行は任意 */
export function parsePriceCsv(text: string): { book: PriceBook; errors: string[] } {
  const book: PriceBook = {};
  const errors: string[] = [];
  const known = new Set(WORK_ITEMS.map((w) => w.id));
  const lines = text.replace(/\r\n?/g, '\n').split('\n').filter((l) => l.trim());
  lines.forEach((line, i) => {
    const cols = splitCsvLine(line);
    if (i === 0 && /(^|,)\s*id\s*(,|$)/i.test(line)) return; // ヘッダ
    const [id, , lowS, highS, source] = cols;
    if (!id) return;
    if (!known.has(id.trim())) {
      errors.push(`${i + 1}行目: 未知の工事項目ID「${id.trim()}」`);
      return;
    }
    const low = Number(String(lowS ?? '').replace(/[,¥ ]/g, ''));
    const high = Number(String(highS ?? '').replace(/[,¥ ]/g, ''));
    if (!Number.isFinite(low) || !Number.isFinite(high) || low < 0 || high < low) {
      errors.push(`${i + 1}行目: 単価が読み取れません（低い値 ≤ 高い値 の順で入れてください）`);
      return;
    }
    book[id.trim()] = { id: id.trim(), low, high, source: source?.trim() || undefined };
  });
  return { book, errors };
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

/** 取り込み用テンプレートCSV（現在の参考値入り） */
export function priceTemplateCsv(): string {
  const head = 'id,name,low,high,source';
  const rows = WORK_ITEMS.map(
    (w) =>
      `${w.id},"${w.name.replace(/"/g, '""')}",${w.materialUnitPrice.low},${w.materialUnitPrice.high},`,
  );
  return [head, ...rows].join('\n') + '\n';
}

/** 単価帳を反映した工事項目を返す。上書きした項目は verified:true */
export function applyPriceBook(book: PriceBook | undefined): WorkItem[] {
  if (!book || Object.keys(book).length === 0) return WORK_ITEMS;
  return WORK_ITEMS.map((w) => {
    const o = book[w.id];
    if (!o) return w;
    return {
      ...w,
      materialUnitPrice: {
        low: o.low,
        high: o.high,
        verified: true as unknown as false, // 実データ投入済み
        source: (o.source ?? 'imported') as unknown as 'placeholder',
      },
    };
  });
}
