import { esc } from './html';

/**
 * 御見積書。
 *
 * そのまま相手に出せる書式であること、そして出す前に全部直せることを両立させる。
 * 金額の丸めや消費税の扱いは日本の実務に合わせ、計算はここに集約する（画面側では持たない）。
 */

export interface QuoteParty {
  /** 会社名・屋号 */
  name: string;
  postal?: string;
  address?: string;
  tel?: string;
  email?: string;
  /** 担当者名 */
  person?: string;
  /** インボイス（適格請求書発行事業者）登録番号 */
  invoiceNo?: string;
  /** 社印の画像（データURL）。無ければ押印枠だけを出す */
  sealDataUrl?: string;
}

export interface QuoteLine {
  id: string;
  /** 品名 */
  name: string;
  /** 仕様・摘要 */
  spec?: string;
  qty: number;
  unit: string;
  unitPrice: number;
  note?: string;
  /** 金額を出さず「別途」と書く行 */
  tbd?: boolean;
  /** 見出しだけの行。小計には入れない */
  heading?: boolean;
  /** 取り込み元の参考レンジ。自分の単価に直したかを見張るために持つ */
  fromRange?: { low: number; high: number };
  /** 単価を人が直したか */
  edited?: boolean;
}

export type TaxMode = 'exclusive' | 'inclusive' | 'none';
export type Rounding = 'floor' | 'round' | 'ceil';

export interface QuoteDoc {
  /** 見積番号 */
  no: string;
  /** 発行日 YYYY-MM-DD */
  issuedOn: string;
  /** 有効期限 YYYY-MM-DD */
  validUntil?: string;
  clientName: string;
  clientHonorific: '御中' | '様';
  /** 件名 */
  subject: string;
  /** 工事場所 */
  site?: string;
  /** 工期 */
  period?: string;
  /** 支払条件 */
  payment?: string;
  from: QuoteParty;
  lines: QuoteLine[];
  /** 諸経費の率(%) */
  overheadPct: number;
  overheadLabel: string;
  /** 値引き（正の数、円） */
  discount: number;
  taxMode: TaxMode;
  /** 税率 0.1 など */
  taxRate: number;
  /** 消費税の端数処理。実務では切り捨てが多い */
  taxRounding: Rounding;
  notes: string;
  /** 「概算」の断りを載せるか */
  provisional: boolean;
}

export interface QuoteTotals {
  /** 明細の合計 */
  subtotal: number;
  overhead: number;
  discount: number;
  /** 税抜の対象額 */
  net: number;
  tax: number;
  /** 請求（見積）合計 */
  total: number;
  /** 別途見積の行数 */
  tbdCount: number;
}

const round = (n: number, how: Rounding): number =>
  how === 'floor' ? Math.floor(n) : how === 'ceil' ? Math.ceil(n) : Math.round(n);

export function lineAmount(l: QuoteLine): number {
  if (l.heading || l.tbd) return 0;
  return Math.round(l.qty * l.unitPrice);
}

export function quoteTotals(d: QuoteDoc): QuoteTotals {
  const subtotal = d.lines.reduce((s, l) => s + lineAmount(l), 0);
  const overhead = Math.round((subtotal * (d.overheadPct || 0)) / 100);
  const discount = Math.max(0, Math.round(d.discount || 0));
  const gross = Math.max(0, subtotal + overhead - discount);

  if (d.taxMode === 'none') {
    return { subtotal, overhead, discount, net: gross, tax: 0, total: gross, tbdCount: d.lines.filter((l) => l.tbd).length };
  }
  if (d.taxMode === 'inclusive') {
    // 明細が税込のとき。合計から内税を割り戻す
    const net = round(gross / (1 + d.taxRate), d.taxRounding);
    return { subtotal, overhead, discount, net, tax: gross - net, total: gross, tbdCount: d.lines.filter((l) => l.tbd).length };
  }
  const tax = round(gross * d.taxRate, d.taxRounding);
  return { subtotal, overhead, discount, net: gross, tax, total: gross + tax, tbdCount: d.lines.filter((l) => l.tbd).length };
}

const yen = (n: number): string => '¥' + Math.round(n).toLocaleString('ja-JP');
const qty = (n: number): string =>
  Number.isInteger(n) ? n.toLocaleString('ja-JP') : n.toLocaleString('ja-JP', { maximumFractionDigits: 2 });

/** YYYY-MM-DD を「2026年8月22日」にする。空なら空 */
export function jpDate(iso: string | undefined): string {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${Number(m[1])}年${Number(m[2])}月${Number(m[3])}日`;
}

/** 単価を直していない、取り込んだままの行 */
export function untouchedLines(d: QuoteDoc): QuoteLine[] {
  return d.lines.filter((l) => !l.heading && !l.tbd && l.fromRange && !l.edited);
}

const QUOTE_CSS = `
  @page { size: A4 portrait; margin: 14mm 13mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: "Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", serif;
    color: #16161a; font-size: 10.5pt; line-height: 1.6;
    background: #f2f0ec; padding: 24px;
  }
  .sheet {
    width: 210mm; min-height: 297mm; margin: 0 auto; padding: 14mm 13mm;
    background: #fff; box-shadow: 0 2px 18px rgba(0,0,0,.12);
  }
  .doc-title {
    text-align: center; font-size: 20pt; letter-spacing: .5em; font-weight: 600;
    margin: 0 0 2mm; padding-left: .5em;
  }
  .rule { border: 0; border-top: 1.6pt solid #16161a; width: 46mm; margin: 0 auto 7mm; }
  .head { display: flex; gap: 8mm; align-items: flex-start; }
  .head-l { flex: 1 1 auto; min-width: 0; }
  .head-r { flex: 0 0 66mm; font-size: 9.5pt; }
  .client { font-size: 14pt; border-bottom: .8pt solid #16161a; padding: 0 2mm 1.5mm; margin-bottom: 5mm; }
  .client .hon { font-size: 11pt; margin-left: 1.5em; }
  .grand { border: 1.2pt solid #16161a; padding: 2.5mm 4mm; margin-bottom: 4mm; display: flex; align-items: baseline; gap: 4mm; }
  .grand .lab { font-size: 10pt; letter-spacing: .18em; }
  .grand .val { font-size: 17pt; font-weight: 600; font-variant-numeric: tabular-nums; letter-spacing: .02em; }
  .grand .tax { font-size: 8.5pt; color: #55524d; }
  .facts { font-size: 9.5pt; }
  .facts div { display: flex; gap: 3mm; margin: .6mm 0; }
  .facts dt { flex: 0 0 20mm; color: #55524d; }
  .meta-row { display: flex; justify-content: space-between; gap: 3mm; }
  .issuer { margin-top: 3mm; padding-top: 2mm; border-top: .6pt solid #cfcac1; position: relative; }
  .issuer .nm { font-size: 12pt; font-weight: 600; }
  .issuer p { margin: .4mm 0; }
  .seal { position: absolute; top: 2mm; right: 0; width: 17mm; height: 17mm; border: .8pt dashed #b9b3a8; border-radius: 2mm; }
  .seal img { width: 100%; height: 100%; object-fit: contain; }
  .seal.filled { border: 0; }
  table.items { width: 100%; border-collapse: collapse; margin-top: 7mm; font-size: 9.5pt; }
  table.items th {
    background: #16161a; color: #fff; font-weight: 500; padding: 1.8mm 2mm;
    border: .6pt solid #16161a; text-align: center; letter-spacing: .04em;
  }
  table.items td { border: .6pt solid #b9b3a8; padding: 1.8mm 2mm; vertical-align: top; }
  table.items td.n { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  table.items td.c { text-align: center; white-space: nowrap; }
  table.items tr.heading td { background: #f2f0ec; font-weight: 600; letter-spacing: .04em; }
  .spec { display: block; font-size: 8.5pt; color: #55524d; margin-top: .5mm; }
  .sum { margin-top: 4mm; display: flex; justify-content: flex-end; }
  table.sum-t { border-collapse: collapse; min-width: 78mm; font-size: 10pt; }
  table.sum-t th { text-align: left; font-weight: 400; color: #55524d; padding: 1.6mm 3mm; border-bottom: .6pt solid #e0dcd4; }
  table.sum-t td { text-align: right; font-variant-numeric: tabular-nums; padding: 1.6mm 3mm; border-bottom: .6pt solid #e0dcd4; white-space: nowrap; }
  table.sum-t tr.total th, table.sum-t tr.total td { border-top: 1.2pt solid #16161a; border-bottom: 1.2pt solid #16161a; font-size: 12pt; font-weight: 600; color: #16161a; }
  .notes { margin-top: 6mm; border: .6pt solid #b9b3a8; padding: 3mm 4mm; font-size: 9pt; }
  .notes h3 { margin: 0 0 1.5mm; font-size: 9.5pt; font-weight: 600; letter-spacing: .08em; }
  .notes p { margin: .8mm 0; white-space: pre-wrap; }
  .prov { margin-top: 4mm; font-size: 8.5pt; color: #55524d; line-height: 1.75; }
  /* 画面で見るときは幅に合わせて畳む。印刷は下のルールでA4に戻す */
  @media screen and (max-width: 860px) {
    body { padding: 10px; font-size: 10pt; }
    .sheet { width: 100%; min-height: 0; padding: 7mm 6mm; }
    .head { flex-direction: column; gap: 5mm; }
    .head-r { flex: 1 1 auto; width: 100%; }
    table.items { font-size: 8.5pt; }
    table.items th, table.items td { padding: 1.2mm 1.4mm; }
  }
  @media print {
    body { background: #fff; padding: 0; }
    .sheet { width: auto; min-height: 0; margin: 0; padding: 0; box-shadow: none; }
    .head { flex-direction: row; }
    .head-r { flex: 0 0 66mm; width: auto; }
    table.items { break-inside: auto; }
    table.items tr { break-inside: avoid; }
    thead { display: table-header-group; }
  }
`;

function partyBlock(p: QuoteParty): string {
  const rows = [
    p.postal ? `〒${esc(p.postal)}` : '',
    p.address ? esc(p.address) : '',
    p.tel ? `TEL ${esc(p.tel)}` : '',
    p.email ? esc(p.email) : '',
    p.person ? `担当 ${esc(p.person)}` : '',
    p.invoiceNo ? `登録番号 ${esc(p.invoiceNo)}` : '',
  ].filter(Boolean);
  const seal = p.sealDataUrl
    ? `<span class="seal filled"><img src="${esc(p.sealDataUrl)}" alt=""></span>`
    : '<span class="seal"></span>';
  return `<div class="issuer">${seal}<div class="nm">${esc(p.name || '（自社名を入れてください）')}</div>${rows
    .map((r) => `<p>${r}</p>`)
    .join('')}</div>`;
}

export function renderQuote(d: QuoteDoc): string {
  const t = quoteTotals(d);

  // 番号は品目だけに振る。見出しには振らない
  let no = 0;
  const itemRows = d.lines
    .map((l) => {
      if (l.heading) {
        return `<tr class="heading"><td class="c">-</td><td colspan="6">${esc(l.name)}</td></tr>`;
      }
      no += 1;
      const amount = l.tbd ? '別途' : yen(lineAmount(l));
      return (
        `<tr><td class="c">${no}</td>` +
        `<td>${esc(l.name)}${l.spec ? `<span class="spec">${esc(l.spec)}</span>` : ''}</td>` +
        `<td class="n">${l.tbd ? '-' : qty(l.qty)}</td>` +
        `<td class="c">${esc(l.unit)}</td>` +
        `<td class="n">${l.tbd ? '-' : yen(l.unitPrice)}</td>` +
        `<td class="n">${amount}</td>` +
        `<td>${esc(l.note ?? '')}</td></tr>`
      );
    })
    .join('');

  const taxLabel =
    d.taxMode === 'none'
      ? '消費税（対象外）'
      : d.taxMode === 'inclusive'
        ? `内 消費税(${Math.round(d.taxRate * 100)}%)`
        : `消費税(${Math.round(d.taxRate * 100)}%)`;

  const sumRows = [
    `<tr><th>小計</th><td>${yen(t.subtotal)}</td></tr>`,
    d.overheadPct ? `<tr><th>${esc(d.overheadLabel)}(${d.overheadPct}%)</th><td>${yen(t.overhead)}</td></tr>` : '',
    t.discount ? `<tr><th>値引</th><td>-${yen(t.discount)}</td></tr>` : '',
    d.taxMode === 'exclusive' ? `<tr><th>税抜合計</th><td>${yen(t.net)}</td></tr>` : '',
    `<tr><th>${taxLabel}</th><td>${yen(t.tax)}</td></tr>`,
    `<tr class="total"><th>御見積合計</th><td>${yen(t.total)}</td></tr>`,
  ]
    .filter(Boolean)
    .join('');

  const facts = [
    ['件名', d.subject],
    ['工事場所', d.site ?? ''],
    ['工期', d.period ?? ''],
    ['有効期限', jpDate(d.validUntil)],
    ['支払条件', d.payment ?? ''],
  ]
    .filter(([, v]) => v)
    .map(([k, v]) => `<div><dt>${esc(k!)}</dt><dd>${esc(v!)}</dd></div>`)
    .join('');

  const provisional = d.provisional
    ? `<p class="prov">本書は概算です。数量は図面・現地の計測にもとづく想定値、単価は参考値を含みます。着工前に現地調査のうえ、正式な見積書をあらためて提出します。${
        t.tbdCount ? `「別途」と記した${t.tbdCount}件は本書の金額に含みません。` : ''
      }</p>`
    : t.tbdCount
      ? `<p class="prov">「別途」と記した${t.tbdCount}件は本書の金額に含みません。</p>`
      : '';

  const body = `
  <div class="sheet">
    <h1 class="doc-title">御見積書</h1>
    <hr class="rule">

    <div class="head">
      <div class="head-l">
        <div class="client">${esc(d.clientName || '　')}<span class="hon">${esc(d.clientHonorific)}</span></div>
        <div class="grand">
          <span class="lab">御見積金額</span>
          <span class="val">${yen(t.total)}</span>
          <span class="tax">${d.taxMode === 'none' ? '(税対象外)' : '(消費税込)'}</span>
        </div>
        <dl class="facts">${facts}</dl>
      </div>
      <div class="head-r">
        <div class="meta-row"><span>見積番号</span><span>${esc(d.no)}</span></div>
        <div class="meta-row"><span>発行日</span><span>${esc(jpDate(d.issuedOn))}</span></div>
        ${partyBlock(d.from)}
      </div>
    </div>

    <table class="items">
      <thead>
        <tr>
          <th style="width:9mm">No</th><th>品名・仕様</th><th style="width:16mm">数量</th>
          <th style="width:12mm">単位</th><th style="width:23mm">単価</th>
          <th style="width:25mm">金額</th><th style="width:28mm">備考</th>
        </tr>
      </thead>
      <tbody>${itemRows || '<tr><td class="c">-</td><td colspan="6">明細がありません</td></tr>'}</tbody>
    </table>

    <div class="sum"><table class="sum-t">${sumRows}</table></div>

    ${d.notes ? `<div class="notes"><h3>備考</h3><p>${esc(d.notes)}</p></div>` : ''}
    ${provisional}
  </div>`;

  return `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><title>御見積書 ${esc(d.no)}</title><style>${QUOTE_CSS}</style></head><body>${body}</body></html>`;
}

/** 会計ソフトや表計算に渡すためのCSV（Excelで開けるようBOM付き） */
export function quoteCsv(d: QuoteDoc): string {
  const q = (s: string | number) => `"${String(s).replaceAll('"', '""')}"`;
  const head = ['No', '品名', '仕様', '数量', '単位', '単価', '金額', '備考'].map(q).join(',');
  let n = 0;
  const rows = d.lines.map((l) =>
    [
      l.heading ? '' : ++n,
      l.name,
      l.spec ?? '',
      l.heading || l.tbd ? '' : l.qty,
      l.heading ? '' : l.unit,
      l.heading || l.tbd ? '' : l.unitPrice,
      l.heading ? '' : l.tbd ? '別途' : lineAmount(l),
      l.note ?? '',
    ]
      .map(q)
      .join(','),
  );
  const t = quoteTotals(d);
  const tail = [
    ['', '小計', '', '', '', '', t.subtotal, ''].map(q).join(','),
    d.overheadPct ? ['', d.overheadLabel, '', '', '', '', t.overhead, ''].map(q).join(',') : '',
    t.discount ? ['', '値引', '', '', '', '', -t.discount, ''].map(q).join(',') : '',
    ['', '消費税', '', '', '', '', t.tax, ''].map(q).join(','),
    ['', '合計', '', '', '', '', t.total, ''].map(q).join(','),
  ].filter(Boolean);
  return '﻿' + [head, ...rows, ...tail].join('\r\n') + '\r\n';
}
