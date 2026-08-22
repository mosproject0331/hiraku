export function esc(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** 固定免責文(§10-1) */
export const DISCLAIMER =
  '本ツールの診断・見積は情報整理を目的とした参考情報であり、法的助言、建築士による設計・調査、不動産取引の媒介ではありません。実際の可否・費用・安全性は、必ず所管行政庁および建築士等の専門家にご確認ください。';

export const BASE_CSS = `
  * { box-sizing: border-box; }
  body { font-family: "Hiragino Sans", "Noto Sans JP", sans-serif; color: #1e293b; margin: 0; padding: 32px; line-height: 1.7; font-size: 14px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  h2 { font-size: 16px; margin: 28px 0 10px; padding-left: 8px; border-left: 4px solid #334155; }
  h3 { font-size: 14px; margin: 14px 0 6px; }
  .meta { color: #64748b; font-size: 12px; }
  .card { border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px 14px; margin: 10px 0; page-break-inside: avoid; }
  .mark { display: inline-block; width: 1.6em; font-weight: 700; }
  .v-ok { color: #15803d; } .v-conditional { color: #2563eb; } .v-hard { color: #b45309; } .v-ng { color: #b91c1c; } .v-unknown { color: #64748b; }
  .badge { display: inline-block; border-radius: 4px; padding: 1px 8px; font-size: 11px; margin-left: 6px; background: #f1f5f9; color: #475569; }
  .q { background: #f8fafc; border-left: 3px solid #94a3b8; padding: 6px 10px; margin: 6px 0; font-size: 13px; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border-top: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0; padding: 6px 8px; text-align: left; vertical-align: top; font-size: 13px; }
  th { background: #f8fafc; }
  ul { padding-left: 1.4em; margin: 6px 0; }
  li { margin: 3px 0; }
  .disclaimer { margin-top: 32px; padding: 12px; border: 1px solid #cbd5e1; background: #f8fafc; font-size: 12px; color: #475569; }
  .summary-row { display: flex; gap: 14px; flex-wrap: wrap; margin: 8px 0; }
  .summary-row span { font-size: 13px; }
  .shots { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
  .shots img { width: 150px; height: 112px; object-fit: cover; border-radius: 6px; border: 1px solid #cbd5e1; }
  @media print {
    body { padding: 0; font-size: 12px; }
    h2 { break-after: avoid; }
    .no-print { display: none; }
  }
`;

export function htmlDoc(title: string, body: string): string {
  return `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${BASE_CSS}</style></head><body>${body}</body></html>`;
}
