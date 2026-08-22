import { estimatePlan, type PriceBook } from '@hiraku/estimate';
import type { RenovationOp, SpaceModel } from '@hiraku/core';
import type { QuoteDoc, QuoteLine, QuoteParty } from '@hiraku/report';

/**
 * 見積書のたたき台をつくる。
 *
 * 概算の幅（低〜高）をそのまま相手には出せないので、いったん中央の値を入れておき、
 * 「まだ自分の単価に直していない行」が分かるように印を残す。
 */

const ISSUER_KEY = 'hiraku-issuer';

export function loadIssuer(): QuoteParty {
  if (typeof window === 'undefined') return { name: '' };
  try {
    const raw = window.localStorage.getItem(ISSUER_KEY);
    if (raw) return JSON.parse(raw) as QuoteParty;
  } catch {
    /* 壊れていたら初期値で始める */
  }
  return { name: '' };
}

export function saveIssuer(p: QuoteParty): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(ISSUER_KEY, JSON.stringify(p));
}

export function todayIso(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + days);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function quoteNumber(seed = new Date()): string {
  const y = seed.getFullYear();
  const p = (n: number) => String(n).padStart(2, '0');
  return `Q${y}${p(seed.getMonth() + 1)}${p(seed.getDate())}-01`;
}

let seq = 0;
const freshId = () => `ql-${Date.now().toString(36)}-${(seq++).toString(36)}`;

export function emptyLine(): QuoteLine {
  return { id: freshId(), name: '', qty: 1, unit: '式', unitPrice: 0 };
}

export function headingLine(name: string): QuoteLine {
  return { id: freshId(), name, qty: 0, unit: '', unitPrice: 0, heading: true };
}

export interface BuildOptions {
  clientName?: string;
  subject?: string;
  site?: string;
  /** 幅のどこを取るか */
  pick?: 'low' | 'mid' | 'high';
}

/** 改修案（ops）から明細を起こす */
export function linesFromPlan(
  model: SpaceModel,
  ops: RenovationOp[],
  priceBook: PriceBook | undefined,
  pick: 'low' | 'mid' | 'high' = 'mid',
): QuoteLine[] {
  const est = estimatePlan(model, ops, priceBook);
  const out: QuoteLine[] = [];
  let lastCategory = '';
  let needsProFee = false;

  for (const l of est.lines) {
    if (l.category !== lastCategory) {
      out.push(headingLine(l.category));
      lastCategory = l.category;
    }
    const total = pick === 'low' ? l.lowYen : pick === 'high' ? l.highYen : Math.round((l.lowYen + l.highYen) / 2);
    const q = l.qty > 0 ? l.qty : 1;
    const notes: string[] = [];
    if (l.requiredLicense) {
      notes.push('材料費のみ / 施工は' + l.requiredLicense);
      needsProFee = true;
    }
    if (l.structuralWarning) notes.push('構造の確認が必要');
    if (!l.verified) notes.push('単価は要確認');
    out.push({
      id: freshId(),
      name: l.name,
      spec: l.note,
      qty: Math.round(q * 100) / 100,
      unit: l.unit,
      // 端数まで割り戻すと同じ材料で単価がぶれる。10円単位に丸めて揃える
      unitPrice: Math.max(0, Math.round(total / q / 10) * 10),
      note: notes.join(' / '),
      fromRange: { low: l.lowYen, high: l.highYen },
    });
  }

  if (needsProFee) {
    out.push(headingLine('専門・有資格工事'));
    out.push({
      id: freshId(),
      name: '有資格工事の施工費',
      spec: '電気・給排水など。施工店の見積による',
      qty: 1,
      unit: '式',
      unitPrice: 0,
      tbd: true,
    });
  }
  return out;
}

export function newQuote(opts: BuildOptions = {}): QuoteDoc {
  const issued = todayIso();
  return {
    no: quoteNumber(),
    issuedOn: issued,
    validUntil: addDaysIso(issued, 30),
    clientName: opts.clientName ?? '',
    clientHonorific: '様',
    subject: opts.subject ?? '空き家改修工事',
    site: opts.site ?? '',
    period: '',
    payment: '着手時50% / 完了時50%',
    from: loadIssuer(),
    lines: [],
    overheadPct: 10,
    overheadLabel: '諸経費',
    discount: 0,
    taxMode: 'exclusive',
    taxRate: 0.1,
    taxRounding: 'floor',
    notes: '',
    provisional: true,
  };
}
