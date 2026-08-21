import {
  VERDICT_LABEL,
  VERDICT_MARK,
  ZONE_LABEL,
  USE_LABEL,
  type ConfirmDesk,
  type DiagnosisInput,
  type DiagnosisReport,
  type Verdict,
} from '@hiraku/rules';
import { getRegionPack } from '@hiraku/regionpack';
import { DISCLAIMER, esc, htmlDoc } from './html';

const V_ORDER: Verdict[] = ['ok', 'conditional', 'hard', 'ng', 'unknown'];

function renderRegionSection(regionPackId?: string): string {
  if (!regionPackId) return '';
  const pack = getRegionPack(regionPackId);
  if (!pack) return '';
  const item = (i: { title: string; summary: string }) =>
    `<li><b>${esc(i.title)}</b> — ${esc(i.summary)}<span class="badge">参考値・要検証</span></li>`;
  return `
    <h2>地域情報(パック適用時): ${esc(pack.name)}</h2>
    <p class="meta">この地域パックの内容はプレースホルダです。実データの投入・検証が必要です。</p>
    <h3>条例・上乗せ</h3><ul>${pack.ordinances.map(item).join('')}</ul>
    <h3>補助金</h3><ul>${pack.subsidies.map(item).join('')}</ul>
    <h3>窓口</h3><ul>${pack.contacts.map(item).join('')}</ul>
    <h3>ローカル知見</h3><ul>${pack.localKnowledge.map(item).join('')}</ul>`;
}

function inputSummary(input: DiagnosisInput): string {
  const zone = input.youtoChiiki === 'unknown' ? 'わからない' : ZONE_LABEL[input.youtoChiiki];
  const rows: [string, string][] = [
    ['所在地', input.address ?? '(未入力)'],
    ['やりたい用途', USE_LABEL[input.desiredUse]],
    ['用途地域', zone],
    ['延床面積', input.floorAreaM2 != null ? `${input.floorAreaM2}㎡` : 'わからない'],
    ['建築年', input.builtYear != null ? `${input.builtYear}年ごろ` : 'わからない'],
    ['検査済証', input.kensazumi === 'yes' ? 'ある' : input.kensazumi === 'no' ? 'ない' : 'わからない'],
  ];
  return `<table><tbody>${rows
    .map(([k, v]) => `<tr><th style="width:9em">${esc(k)}</th><td>${esc(v)}</td></tr>`)
    .join('')}</tbody></table>`;
}

export function renderDiagnosisReport(input: DiagnosisInput, report: DiagnosisReport, regionPackId?: string): string {
  const counts = V_ORDER.map(
    (v) =>
      `<span class="v-${v}"><b>${VERDICT_MARK[v]}</b> ${VERDICT_LABEL[v]}: ${report.counts[v]}件</span>`,
  ).join('');

  const cards = report.findings
    .map(
      (f) => `
    <div class="card">
      <div><span class="mark v-${f.verdict}">${VERDICT_MARK[f.verdict]}</span><b>${esc(f.title)}</b><span class="badge">${esc(f.category)}</span><span class="badge">${VERDICT_LABEL[f.verdict]}</span></div>
      <p style="margin:6px 0">${esc(f.summary)}</p>
      <p style="margin:6px 0;color:#475569;font-size:13px">${esc(f.detail)}</p>
      <div class="meta">確認先: ${f.confirmWith.map(esc).join(' / ') || 'なし'}</div>
    </div>`,
    )
    .join('');

  // 確認先マトリクス: 窓口 × 質問文
  const byDesk = new Map<ConfirmDesk, { title: string; questions: string[] }[]>();
  for (const f of report.findings) {
    if (f.verdict === 'ok') continue;
    for (const desk of f.confirmWith) {
      if (!byDesk.has(desk)) byDesk.set(desk, []);
      byDesk.get(desk)!.push({ title: f.title, questions: f.questions });
    }
  }
  const matrix = [...byDesk.entries()]
    .map(
      ([desk, items]) => `
    <h3>${esc(desk)}</h3>
    ${items
      .map(
        (it) =>
          `<div class="q"><b>${esc(it.title)}</b><br>${it.questions.map((q) => '「' + esc(q) + '」').join('<br>')}</div>`,
      )
      .join('')}`,
    )
    .join('');

  const body = `
    <h1>法規制診断レポート</h1>
    <div class="meta">生成: ${esc(report.generatedAt.slice(0, 10))} / HIRAKU(仮称) — 断定ではなく「可能性と確認先」を整理したものです</div>

    <h2>物件と計画の概要</h2>
    ${inputSummary(input)}

    <h2>総合サマリ</h2>
    <div class="summary-row">${counts}</div>
    <p class="meta">◎=進めやすい可能性 / ○=条件付き / △=ハードルあり / ×=難しい可能性 / ?=情報不足。×や△があっても道が無いとは限りません。確認先への相談が次の一歩です。</p>

    <h2>判定カード(${report.findings.length}件)</h2>
    ${cards}

    <h2>まだ分かっていないこと</h2>
    ${
      report.unknowns.length
        ? `<ul>${report.unknowns.map((u) => `<li>${esc(u)}</li>`).join('')}</ul>`
        : '<p>入力いただいた範囲では、大きな抜けはありません。</p>'
    }

    <h2>確認先マトリクス — 窓口でそのまま使える質問文</h2>
    <p class="meta">窓口ごとに質問をまとめています。このページを印刷して持っていけば、そのまま相談できます。</p>
    ${matrix}

    ${renderRegionSection(regionPackId)}

    <h2>次のアクション</h2>
    <ol>${report.nextActions.map((a) => `<li>${esc(a)}</li>`).join('')}</ol>

    <div class="disclaimer">${esc(DISCLAIMER)}</div>
  `;
  return htmlDoc('法規制診断レポート', body);
}
