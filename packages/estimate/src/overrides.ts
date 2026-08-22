import { WORK_ITEMS, type PriceBasis, type WorkItem } from './data/work-items';

export interface PriceOverride {
  id: string;
  low: number;
  high: number;
  /** 出所メモ（積算シート名・仕入先など） */
  source?: string;
  /** いつ時点の数字か (YYYY-MM) */
  asOf?: string;
  /** 何の値段か。省略すると元の種別のまま */
  basis?: PriceBasis;
  /** 覚え書き */
  note?: string;
}

export type PriceBook = Record<string, PriceOverride>;

/** CSV（id,name,low,high,source）を解析する。ヘッダ行は任意 */
export function parsePriceCsv(text: string): { book: PriceBook; errors: string[] } {
  const book: PriceBook = {};
  const errors: string[] = [];
  const known = new Set(WORK_ITEMS.map((w) => w.id));
  const lines = text.replace(/\r\n?/g, '\n').split('\n').filter((l) => l.trim());
  lines.forEach((line, i) => {
    const cols = splitCsvLine(line.replace(/^\ufeff/, ''));
    if (i === 0 && /(^|,)\s*id\s*(,|$)/i.test(line)) return; // ヘッダ
    // 新しい並び: id,name,unit,basis,low,high,source,asOf
    // 古い並び:   id,name,low,high,source  ——どちらも読めるようにする
    const looksNew = cols.length >= 6 && /^(material|equipment|installed|service)$/.test((cols[3] ?? '').trim());
    const id = cols[0];
    const basisS = looksNew ? cols[3]?.trim() : undefined;
    const lowS = looksNew ? cols[4] : cols[2];
    const highS = looksNew ? cols[5] : cols[3];
    const source = looksNew ? cols[6] : cols[4];
    const asOf = looksNew ? cols[7]?.trim() : undefined;
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
    book[id.trim()] = {
      id: id.trim(),
      low,
      high,
      source: source?.trim() || undefined,
      asOf: asOf || undefined,
      basis: (basisS as PriceOverride['basis']) || undefined,
    };
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
export function priceTemplateCsv(book?: PriceBook): string {
  const head = 'id,name,unit,basis,low,high,source,asOf';
  const items = applyPriceBook(book);
  const rows = items.map((w) => {
    const q = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const p = w.materialUnitPrice;
    return [
      w.id, q(w.name), w.unit, p.basis, p.low, p.high,
      q(p.verified ? p.source : ''), p.asOf ?? '',
    ].join(',');
  });
  return '\ufeff' + [head, ...rows].join('\r\n') + '\r\n';
}

/**
 * 自分の単価帳を初期値にかぶせる。
 * 入れた数字は「確かめた数字」として扱う——出どころを本人が知っているから。
 */
export function applyPriceBook(book: PriceBook | undefined): WorkItem[] {
  if (!book || Object.keys(book).length === 0) return WORK_ITEMS;
  return WORK_ITEMS.map((w) => {
    const o = book[w.id];
    if (!o) return w;
    return {
      ...w,
      materialUnitPrice: {
        ...w.materialUnitPrice,
        low: o.low,
        high: o.high,
        basis: o.basis ?? w.materialUnitPrice.basis,
        source: o.source?.trim() || '自分の単価帳',
        asOf: o.asOf,
        verified: true,
      },
    };
  });
}

/** まだ自分の数字に置き換わっていない項目 */
export function unverifiedItems(book: PriceBook | undefined): WorkItem[] {
  return applyPriceBook(book).filter((w) => !w.materialUnitPrice.verified);
}
