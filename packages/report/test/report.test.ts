import { describe, expect, it } from 'vitest';
import { reverseLookup, runDiagnosis, type DiagnosisInput } from '@hiraku/rules';
import { renderDiagnosisReport, renderModeAReport, renderSurveyReport, esc, DISCLAIMER } from '../src/index';
import type { SpaceModel } from '@hiraku/core';

function emptyModel(): SpaceModel {
  return {
    id: 't',
    levels: [{ id: 'L1', name: '1階', heightMm: 2400, walls: [], nodes: [], openings: [], rooms: [] }],
    moduleMm: 910,
    scaleFactor: 1,
    version: 1,
  };
}

const input: DiagnosisInput = {
  address: '兵庫県三田市<script>',
  youtoChiiki: 'chosei' as never,
  kuikiKubun: 'chosei',
  bokaChiiki: 'unknown',
  setsudo: { flag: 'unknown' },
  floorAreaM2: 250,
  kensazumi: 'no',
  currentUse: 'jutaku',
  desiredUse: 'cafe',
  landCategory: 'hatake',
  haisui: 'jokaso',
};

describe('診断レポートHTML', () => {
  const fixed: DiagnosisInput = { ...input, youtoChiiki: 'unknown' };
  const html = renderDiagnosisReport(fixed, runDiagnosis(fixed));

  it('主要セクションが揃っている', () => {
    for (const s of ['総合サマリ', '判定カード', 'まだ分かっていないこと', '確認先マトリクス', '次のアクション']) {
      expect(html).toContain(s);
    }
    expect(html).toContain(DISCLAIMER.slice(0, 20));
  });

  it('入力値はエスケープされる(XSS対策 §10-5)', () => {
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('確認先マトリクスに質問文が入る', () => {
    expect(html).toContain('農業委員会');
    expect(html).toContain('「');
  });
});

describe('モードAレポートHTML', () => {
  const html = renderModeAReport(reverseLookup('cafe'), '小', '三田市');
  it('条件・内見・探し方が入る', () => {
    for (const s of ['物件に求める条件', '内見チェックリスト', '探し方ガイド', '用途地域との相性']) {
      expect(html).toContain(s);
    }
  });
});

describe('esc', () => {
  it('HTML特殊文字を全て潰す', () => {
    expect(esc(`<a href="x" onclick='y'>&`)).toBe('&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;');
  });
});

describe('現況調査報告書', async () => {
  const { deserialize, solveConstraints } = await import('@hiraku/core');
  const { renderSurveyReport } = await import('../src/index');
  const raw = (await import('../../core/fixtures/sample-minka.json')).default;
  const model = solveConstraints(deserialize(JSON.stringify(raw)), [
    { id: 'm1', type: 'wallLength', targetIds: ['w9'], valueMm: 5600, createdAt: '2026-08-22T00:00:00Z' },
  ]);
  const html = renderSurveyReport(
    model,
    [{ id: 'm1', type: 'wallLength', targetIds: ['w9'], valueMm: 5600, createdAt: '2026-08-22T00:00:00Z' }],
    [{ id: 'p1', levelId: 'L1', x: 1000, y: 1000, category: '雨漏り', memo: '天井にシミ<b>', photoRef: undefined }],
    '全体に湿気が強い',
  );
  it('平面図SVG・実測・ピン・所見が入る', () => {
    expect(html).toContain('<svg');
    expect(html).toContain('5,600 mm');
    expect(html).toContain('雨漏り');
    expect(html).toContain('全体に湿気が強い');
    expect(html).not.toContain('<b>');
  });
  it('実測済みの壁はDESIGN.mdの実測色で描かれる', () => {
    expect(html).toContain('#2f7a58');
  });

  it('確度3色はDESIGN.md v3.0の値を使う(装飾流用禁止)', () => {
    for (const c of ['#a8a29a', '#2f7a58']) expect(html).toContain(c);
    // 旧Tailwind系の色が残っていないこと
    for (const old of ['#9ca3af', '#d97706', '#16a34a']) expect(html).not.toContain(old);
  });
});

describe('地域情報セクション', async () => {
  const { renderDiagnosisReport: render } = await import('../src/index');
  const { runDiagnosis: run } = await import('@hiraku/rules');
  const base: DiagnosisInput = {
    youtoChiiki: 'unknown', kuikiKubun: 'chosei', bokaChiiki: 'unknown',
    setsudo: { flag: 'unknown' }, kensazumi: 'unknown', currentUse: 'jutaku',
    desiredUse: 'cafe', landCategory: 'unknown', haisui: 'unknown',
  };
  it('パック指定時に補助金・窓口・URLが出る', () => {
    const html = render(base, run(base), 'sanda');
    expect(html).toContain('兵庫県三田市');
    expect(html).toContain('空き家リフォーム補助事業');
    expect(html).toContain('079-559-5118');
    expect(html).toContain('city.sanda.lg.jp');
    expect(html).toContain('要・窓口確認');
  });
  it('パック未指定なら出ない', () => {
    expect(render(base, run(base))).not.toContain('地域情報:');
  });
});

describe('内見チェックの反映', () => {
  it('要対応が先に並び、写真が埋め込まれる', () => {
    const html = renderSurveyReport(emptyModel(), [], [], '', [
      { label: '雨漏りの跡', why: '屋根補修は費用が大きい', state: 'ok', memo: '', photos: [] },
      { label: '床下の腐朽', why: '見えない出費になりやすい', state: 'bad', memo: '北側が湿っている', photos: ['data:image/jpeg;base64,AAA'] },
      { label: '床の傾き', why: '不同沈下のサイン', state: 'watch', memo: '', photos: [] },
    ]);
    const bad = html.indexOf('床下の腐朽');
    const watch = html.indexOf('床の傾き');
    const ok = html.indexOf('雨漏りの跡');
    expect(bad).toBeGreaterThan(-1);
    expect(bad).toBeLessThan(watch);
    expect(watch).toBeLessThan(ok);
    expect(html).toContain('要確認 2件');
    expect(html).toContain('北側が湿っている');
    expect(html).toContain('data:image/jpeg;base64,AAA');
  });

  it('記録が無いときは、その旨を書く', () => {
    const html = renderSurveyReport(emptyModel(), [], [], '');
    expect(html).toContain('内見チェックの記録はありません');
  });
});
