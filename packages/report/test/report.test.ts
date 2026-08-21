import { describe, expect, it } from 'vitest';
import { reverseLookup, runDiagnosis, type DiagnosisInput } from '@hiraku/rules';
import { renderDiagnosisReport, renderModeAReport, esc, DISCLAIMER } from '../src/index';

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
