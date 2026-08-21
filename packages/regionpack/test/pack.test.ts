import { describe, expect, it } from 'vitest';
import { getRegionPack, listRegionPacks } from '../src/index';

describe('地域パック', () => {
  it('sandaパックが引ける', () => {
    expect(listRegionPacks().some((p) => p.id === 'sanda')).toBe(true);
    const p = getRegionPack('sanda')!;
    expect(p.subsidies.length).toBeGreaterThanOrEqual(1);
  });
  it('プレースホルダはすべてverified:falseで「例:」明記', () => {
    const p = getRegionPack('sanda')!;
    for (const item of [...p.ordinances, ...p.subsidies, ...p.contacts, ...p.localKnowledge]) {
      expect(item.verified).toBe(false);
      expect(item.title.startsWith('例:')).toBe(true);
    }
  });
});
