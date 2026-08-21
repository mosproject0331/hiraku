import { VERDICT_LABEL, VERDICT_MARK, ZONE_LABEL, type ModeAResult } from '@hiraku/rules';
import { DISCLAIMER, esc, htmlDoc } from './html';

export function renderModeAReport(r: ModeAResult, scale: string, region: string): string {
  const body = `
    <h1>物件探しの手引き — ${esc(r.useLabel)}</h1>
    <div class="meta">規模感: ${esc(scale)}${region ? ' / 想定地域: ' + esc(region) : ''} / HIRAKU(仮称)</div>

    <h2>物件に求める条件チェックリスト</h2>
    <ul>${r.conditions.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>

    <h2>用途地域との相性(目安)</h2>
    <p class="meta">建築基準法の用途制限の考え方に基づく簡略表です。正確な可否は都市計画課でご確認ください。</p>
    <table><thead><tr><th>用途地域</th><th style="width:11em">目安</th></tr></thead><tbody>
    ${r.zones
      .map(
        (z) =>
          `<tr><td>${esc(ZONE_LABEL[z.zone])}</td><td class="v-${z.verdict}">${VERDICT_MARK[z.verdict]} ${VERDICT_LABEL[z.verdict]}</td></tr>`,
      )
      .join('')}
    </tbody></table>

    <h2>内見チェックリスト(共通)</h2>
    <table><thead><tr><th>見るところ</th><th>なぜ大事か</th></tr></thead><tbody>
    ${r.viewing.common.map((i) => `<tr><td>☐ ${esc(i.label)}</td><td>${esc(i.why)}</td></tr>`).join('')}
    </tbody></table>

    <h2>内見チェックリスト(${esc(r.useLabel)}ならでは)</h2>
    <table><thead><tr><th>見るところ</th><th>なぜ大事か</th></tr></thead><tbody>
    ${r.viewing.byUse.map((i) => `<tr><td>☐ ${esc(i.label)}</td><td>${esc(i.why)}</td></tr>`).join('')}
    </tbody></table>

    <h2>探し方ガイド</h2>
    <ul>${r.searchGuide.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>

    <div class="disclaimer">${esc(DISCLAIMER)}</div>
  `;
  return htmlDoc(`物件探しの手引き — ${r.useLabel}`, body);
}
