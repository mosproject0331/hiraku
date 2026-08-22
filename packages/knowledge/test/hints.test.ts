import { describe, expect, it } from 'vitest';
import { HINTS, nextHints, type ProjectSignals } from '../src/index';

function sig(over: Partial<ProjectSignals> = {}): ProjectSignals {
  return {
    hasModel: false, roomCount: 0, hasDiagnosis: false, heavyFindings: 0,
    hasPlans: false, measuredCount: 0, pinCount: 0, todoTotal: 0, todoDone: 0,
    ...over,
  };
}

describe('ナレッジ層', () => {
  it('パターン名・番号を利用者向けテキストに出さない(D10)', () => {
    for (const h of HINTS) {
      expect(h.text).not.toMatch(/パターン/);
      expect(h.text).not.toMatch(/《.+》/);
      expect(h.text).not.toMatch(/pattern/i);
    }
  });

  it('初期状態では「人格」の問いが最初に出る', () => {
    const hints = nextHints(sig());
    expect(hints[0]!.id).toBe('persona');
  });

  it('重い診断結果には「隙間探し」由来の眺め直しが出る', () => {
    const hints = nextHints(sig({ hasDiagnosis: true, heavyFindings: 3 }));
    expect(hints.some((h) => h.id === 'gap-as-seed')).toBe(true);
  });

  it('3案が出た後は暮らし・引き算の問いが出る', () => {
    const ids = nextHints(sig({ hasPlans: true, hasModel: true, roomCount: 5 }), 12).map((h) => h.id);
    expect(ids).toContain('everyday');
    expect(ids).toContain('subtraction');
  });

  it('安全・権利の警告は、こころの問いより先に出る（押し出されない）', () => {
    const hints = nextHints(sig({ hasPlans: true, hasModel: true, roomCount: 5 }), 3);
    expect(hints[0]!.id).toBe('ws-insurance');
    expect(hints[0]!.urgent).toBe(true);
  });

  it('緊急でなければ、こころが実務より先に並ぶ', () => {
    const hints = nextHints(sig({ hasModel: true, roomCount: 5, measuredCount: 0 }), 10);
    const rest = hints.filter((h) => !h.urgent);
    const firstJitsumu = rest.findIndex((h) => h.kind === 'jitsumu');
    const lastKokoro = rest.map((h) => h.kind).lastIndexOf('kokoro');
    if (firstJitsumu !== -1 && lastKokoro !== -1) expect(lastKokoro).toBeLessThan(firstJitsumu);
  });

  it('27パターンを広くカバーしている', () => {
    const sources = new Set(HINTS.map((h) => h.source.match(/pattern-\d+/g) ?? []).flat());
    expect(sources.size).toBeGreaterThanOrEqual(16);
    expect(HINTS.length).toBeGreaterThanOrEqual(24);
  });

  it('すべてのヒントに発火条件と十分な長さの文がある', () => {
    for (const h of HINTS) {
      expect(typeof h.when).toBe('function');
      expect(h.text.length).toBeGreaterThan(40);
      expect(['kokoro', 'jitsumu']).toContain(h.kind);
    }
  });

  it('idが重複しない', () => {
    expect(new Set(HINTS.map((h) => h.id)).size).toBe(HINTS.length);
  });

  it('どの状態でも最低1つは返る', () => {
    const states = [
      sig(),
      sig({ hasDiagnosis: true }),
      sig({ hasDiagnosis: true, heavyFindings: 4 }),
      sig({ hasPlans: true, hasModel: true, roomCount: 4, measuredCount: 3, todoDone: 4, todoTotal: 6 }),
    ];
    for (const s of states) expect(nextHints(s).length).toBeGreaterThanOrEqual(1);
  });

  it('決定的である(同じ入力→同じ出力)', () => {
    const a = nextHints(sig({ hasPlans: true }), 2).map((h) => h.id);
    const b = nextHints(sig({ hasPlans: true }), 2).map((h) => h.id);
    expect(a).toEqual(b);
  });
});
