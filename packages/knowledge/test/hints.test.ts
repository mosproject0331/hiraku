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

  it('3案が出た後は暮らし・引き算・保険のいずれかが出る', () => {
    const hints = nextHints(sig({ hasPlans: true, hasModel: true, roomCount: 5 }), 4);
    const ids = hints.map((h) => h.id);
    expect(ids).toContain('everyday');
    expect(ids).toContain('ws-insurance');
  });

  it('こころが実務より先に並ぶ', () => {
    const hints = nextHints(sig({ hasPlans: true, hasModel: true, roomCount: 5, measuredCount: 1 }), 10);
    const firstJitsumu = hints.findIndex((h) => h.kind === 'jitsumu');
    const lastKokoro = hints.map((h) => h.kind).lastIndexOf('kokoro');
    expect(lastKokoro).toBeLessThan(firstJitsumu === -1 ? Infinity : firstJitsumu + 100);
    expect(hints[0]!.kind).toBe('kokoro');
  });

  it('決定的である(同じ入力→同じ出力)', () => {
    const a = nextHints(sig({ hasPlans: true }), 2).map((h) => h.id);
    const b = nextHints(sig({ hasPlans: true }), 2).map((h) => h.id);
    expect(a).toEqual(b);
  });
});
