import { describe, expect, it } from 'vitest';
import { getRegionPack, listRegionPacks } from '../src/index';

describe('地域パック', () => {
  it('sandaパックが引ける', () => {
    expect(listRegionPacks().some((p) => p.id === 'sanda')).toBe(true);
    const p = getRegionPack('sanda')!;
    expect(p.subsidies.length).toBeGreaterThanOrEqual(2);
    expect(p.contacts.length).toBeGreaterThanOrEqual(3);
  });

  it('制度は変わるので、すべて verified:false（要・窓口確認）のまま', () => {
    const p = getRegionPack('sanda')!;
    for (const item of [...p.ordinances, ...p.subsidies, ...p.contacts, ...p.localKnowledge]) {
      expect(item.verified).toBe(false);
      expect(item.title.length).toBeGreaterThan(4);
      expect(item.summary.length).toBeGreaterThan(20);
    }
  });

  it('ダミーの「例:」が残っていない', () => {
    const p = getRegionPack('sanda')!;
    for (const item of [...p.ordinances, ...p.subsidies, ...p.contacts, ...p.localKnowledge]) {
      expect(item.title.startsWith('例:')).toBe(false);
    }
  });

  it('窓口には電話番号かURLの手がかりがある', () => {
    const p = getRegionPack('sanda')!;
    const withContact = p.contacts.filter((c) => c.tel || c.url);
    expect(withContact.length).toBeGreaterThanOrEqual(3);
  });
});
