import { describe, expect, it } from 'vitest';
import { RULES, runDiagnosis, reverseLookup, type DiagnosisInput, type Verdict } from '../src/index';

function base(over: Partial<DiagnosisInput> = {}): DiagnosisInput {
  return {
    youtoChiiki: 'dai1_jukyo',
    kuikiKubun: 'shigaika',
    bokaChiiki: 'none',
    setsudo: { roadWidthM: 6, frontageM: 10, flag: 'ok' },
    floorAreaM2: 150,
    floors: 2,
    builtYear: 1975,
    kensazumi: 'no',
    currentUse: 'jutaku',
    desiredUse: 'cafe',
    landCategory: 'takuchi',
    haisui: 'gesui',
    ...over,
  };
}

function evalRule(id: string, input: DiagnosisInput): { applies: boolean; verdict?: Verdict } {
  const rule = RULES.find((r) => r.id === id);
  if (!rule) throw new Error('rule not found: ' + id);
  const applies = rule.appliesTo(input);
  return { applies, verdict: applies ? rule.evaluate(input).verdict : undefined };
}

// [ruleId, 入力上書き, 期待applies, 期待verdict]
const CASES: [string, Partial<DiagnosisInput>, boolean, Verdict | undefined][] = [
  ['zoning-use-matrix', {}, true, 'conditional'],
  ['zoning-use-matrix', { youtoChiiki: 'shogyo' }, true, 'ok'],
  ['zoning-use-matrix', { youtoChiiki: 'unknown' }, false, undefined],
  ['zoning-unknown-guide', { youtoChiiki: 'unknown' }, true, 'unknown'],
  ['zoning-unknown-guide', {}, false, undefined],
  ['zoning-unknown-guide', { youtoChiiki: 'kinrin' }, false, undefined],
  ['chosei-kuiki', { kuikiKubun: 'chosei' }, true, 'hard'],
  ['chosei-kuiki', {}, false, undefined],
  ['chosei-kuiki', { kuikiKubun: 'unknown' }, false, undefined],
  ['hisenbiki-kuikigai', { kuikiKubun: 'hisenbiki' }, true, 'conditional'],
  ['hisenbiki-kuikigai', { kuikiKubun: 'kuikigai' }, true, 'conditional'],
  ['hisenbiki-kuikigai', {}, false, undefined],
  ['setsudo', {}, true, 'ok'],
  ['setsudo', { setsudo: { roadWidthM: 3, frontageM: 5, flag: 'ok' } }, true, 'conditional'],
  ['setsudo', { setsudo: { flag: 'unknown' } }, true, 'unknown'],
  ['hatazao-missetsudo', { setsudo: { flag: 'hatazao' } }, true, 'hard'],
  ['hatazao-missetsudo', { setsudo: { flag: 'none' } }, true, 'ng'],
  ['hatazao-missetsudo', {}, false, undefined],
  ['yoto-henko-200', { floorAreaM2: 250 }, true, 'hard'],
  ['yoto-henko-200', { floorAreaM2: 150 }, true, 'ok'],
  ['yoto-henko-200', { desiredUse: 'minpaku' }, false, undefined],
  ['kensazumi-none', { kensazumi: 'no' }, true, 'hard'],
  ['kensazumi-none', { kensazumi: 'yes' }, false, undefined],
  ['kensazumi-none', { kensazumi: 'unknown' }, false, undefined],
  ['minpaku-todokede', { desiredUse: 'minpaku' }, true, 'conditional'],
  ['minpaku-todokede', {}, false, undefined],
  ['minpaku-todokede', { desiredUse: 'kani_shukuhaku' }, false, undefined],
  ['kanihshukuhaku', { desiredUse: 'kani_shukuhaku' }, true, 'conditional'],
  ['kanihshukuhaku', {}, false, undefined],
  ['kanihshukuhaku', { desiredUse: 'minpaku' }, false, undefined],
  ['inshokuten-kyoka', {}, true, 'conditional'],
  ['inshokuten-kyoka', { desiredUse: 'home_plus' }, true, 'conditional'],
  ['inshokuten-kyoka', { desiredUse: 'retail' }, false, undefined],
  ['kashi-seizo', {}, true, 'conditional'],
  ['kashi-seizo', { desiredUse: 'library' }, false, undefined],
  ['kashi-seizo', { desiredUse: 'home_plus' }, true, 'conditional'],
  ['share-house-kishukusha', { desiredUse: 'sharehouse' }, true, 'conditional'],
  ['share-house-kishukusha', {}, false, undefined],
  ['share-house-kishukusha', { desiredUse: 'coworking' }, false, undefined],
  ['shobo-setsubi', {}, true, 'conditional'],
  ['shobo-setsubi', { desiredUse: 'minpaku' }, true, 'conditional'],
  ['shobo-setsubi', { desiredUse: 'coworking' }, false, undefined],
  ['boka-junboka', { bokaChiiki: 'junboka' }, true, 'conditional'],
  ['boka-junboka', { bokaChiiki: 'boka' }, true, 'conditional'],
  ['boka-junboka', {}, false, undefined],
  ['nochi', { landCategory: 'hatake' }, true, 'hard'],
  ['nochi', { landCategory: 'ta' }, true, 'hard'],
  ['nochi', {}, false, undefined],
  ['haisui-jokaso', { haisui: 'jokaso' }, true, 'conditional'],
  ['haisui-jokaso', { haisui: 'kumitori' }, true, 'conditional'],
  ['haisui-jokaso', {}, false, undefined],
  ['kyu-taishin', { builtYear: 1975 }, true, 'conditional'],
  ['kyu-taishin', { builtYear: 1995 }, true, 'conditional'],
  ['kyu-taishin', { builtYear: 2010 }, false, undefined],
  ['kenyo-jutaku', { desiredUse: 'home_plus' }, true, 'conditional'],
  ['kenyo-jutaku', {}, false, undefined],
  ['kenyo-jutaku', { desiredUse: 'retail' }, false, undefined],
  ['kenpei-yoseki', {}, true, 'ok'],
  ['kenpei-yoseki', { desiredUse: 'minpaku' }, true, 'ok'],
  ['kenpei-yoseki', { youtoChiiki: 'unknown' }, true, 'ok'],
  ['gake-hazard', {}, true, 'unknown'],
  ['gake-hazard', { kuikiKubun: 'kuikigai' }, true, 'unknown'],
  ['gake-hazard', { desiredUse: 'library' }, true, 'unknown'],
  ['bunkazai-denken', {}, true, 'unknown'],
  ['bunkazai-denken', { builtYear: 2010 }, true, 'unknown'],
  ['bunkazai-denken', { desiredUse: 'minpaku' }, true, 'unknown'],
  ['kyusui-shitei', {}, true, 'conditional'],
  ['kyusui-shitei', { desiredUse: 'library' }, true, 'conditional'],
  ['kyusui-shitei', { haisui: 'unknown' }, true, 'conditional'],
  ['gas-koji', {}, true, 'conditional'],
  ['gas-koji', { desiredUse: 'atelier' }, true, 'conditional'],
  ['gas-koji', { haisui: 'kumitori' }, true, 'conditional'],
  ['denki-shikaku', {}, true, 'conditional'],
  ['denki-shikaku', { desiredUse: 'coworking' }, true, 'conditional'],
  ['denki-shikaku', { youtoChiiki: 'kogyo' }, true, 'conditional'],
];

describe('ルール25本', () => {
  it('25本すべて定義されている', () => {
    expect(RULES).toHaveLength(25);
    expect(new Set(RULES.map((r) => r.id)).size).toBe(25);
  });

  for (const [id, over, applies, verdict] of CASES) {
    it(`${id}: ${JSON.stringify(over).slice(0, 60)} → applies=${applies} verdict=${verdict ?? '-'}`, () => {
      const r = evalRule(id, base(over));
      expect(r.applies).toBe(applies);
      if (applies) expect(r.verdict).toBe(verdict);
    });
  }

  it('断定語を使わない(summary/detailの規約チェック)', () => {
    const input = base();
    for (const rule of RULES) {
      if (!rule.appliesTo(input)) continue;
      const f = rule.evaluate(input);
      for (const text of [f.summary, f.detail]) {
        expect(text).not.toMatch(/できます。/);
        expect(text).not.toMatch(/問題ありません/);
        expect(text).not.toMatch(/不要です。/);
      }
    }
  });
});

describe('runDiagnosis', () => {
  it('意地悪入力(調整区域・畑・250㎡・検査済証なし)で重い判定が並ぶ', () => {
    const report = runDiagnosis(
      base({ kuikiKubun: 'chosei', landCategory: 'hatake', floorAreaM2: 250, kensazumi: 'no' }),
    );
    expect(report.counts.hard).toBeGreaterThanOrEqual(3);
    expect(report.findings[0]!.verdict).not.toBe('ok');
    expect(report.nextActions.length).toBeGreaterThan(0);
    expect(report.nextActions.length).toBeLessThanOrEqual(3);
  });

  it('unknown入力は不明点リストに載る', () => {
    const report = runDiagnosis(base({ youtoChiiki: 'unknown', kensazumi: 'unknown' }));
    expect(report.unknowns).toContain('用途地域');
    expect(report.unknowns).toContain('検査済証の有無');
  });

  it('全ての判定に確認先と質問文が付く(kenpei/denki等の情報系も)', () => {
    const report = runDiagnosis(base());
    for (const f of report.findings) {
      expect(f.questions.length).toBeGreaterThan(0);
      expect(f.summary.length).toBeGreaterThan(10);
    }
  });
});

describe('reverseLookup(モードA)', () => {
  it('カフェの条件・内見・探し方が返る', () => {
    const r = reverseLookup('cafe');
    expect(r.useLabel).toContain('カフェ');
    expect(r.conditions.length).toBeGreaterThanOrEqual(3);
    expect(r.viewing.common.length).toBeGreaterThanOrEqual(8);
    expect(r.viewing.byUse.length).toBeGreaterThanOrEqual(2);
    expect(r.zones).toHaveLength(13);
    expect(r.searchGuide.length).toBeGreaterThanOrEqual(3);
  });
});
