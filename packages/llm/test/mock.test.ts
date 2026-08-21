import { describe, expect, it } from 'vitest';
import { deserialize, validateOps } from '@hiraku/core';
import { mockHearingPlans, mockHearingTurn } from '../src/mock';
import raw from '../../core/fixtures/sample-minka.json';

const json = JSON.stringify(raw);

describe('mock hearing', () => {
  it('1往復目は聞き返し、2往復目で3案', () => {
    expect(mockHearingTurn(json, ['カフェにしたい']).plans).toBeUndefined();
    const t = mockHearingTurn(json, ['カフェにしたい', '自分たちでやりたい']);
    expect(t.plans).toHaveLength(3);
  });

  it('モックの3案はすべて検証を通る(error 0)', () => {
    const model = deserialize(json);
    for (const p of mockHearingPlans(model)) {
      const errs = validateOps(model, p.ops).filter((i) => i.level === 'error');
      expect(errs).toHaveLength(0);
      expect(p.ops.length).toBeGreaterThanOrEqual(2);
    }
  });
});
