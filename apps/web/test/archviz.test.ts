import { describe, expect, it } from 'vitest';
import { buildRenovationScene, deserialize, type Site } from '@hiraku/core';
import sample from '@hiraku/core/fixtures/sample-minka.json';
import { buildBuilding, describeSun } from '@/lib/archviz';

const model = deserialize(JSON.stringify(sample));
const scene = buildRenovationScene(model, []);

const SITE: Site = {
  address: '兵庫県三田市', lat: 34.89, lon: 135.23,
  anchorXMm: 0, anchorYMm: 0, rotationDeg: 0, zoom: 20,
};

describe('建物を組み立てる', () => {
  const b = buildBuilding(scene)!;

  it('壁・柱・窓を拾う', () => {
    expect(b.walls.length).toBeGreaterThan(3);
    expect(b.posts.length).toBeGreaterThan(3);
    expect(b.bounds.r).toBeGreaterThan(1);
  });

  it('壁は開口の位置で切り分けられ、面積が抜ける', () => {
    for (const w of b.walls) {
      const total = w.panels.reduce((s, p) => s + p.w * p.h, 0);
      // 開口があるぶん、まるごとの面積より小さい
      expect(total).toBeLessThanOrEqual(w.len * b.height + 1e-6);
      if (w.openings.some((o) => o.width > 0.3)) {
        expect(total).toBeLessThan(w.len * b.height);
      }
    }
  });

  it('外壁は片側にしか部屋がない', () => {
    const ext = b.walls.filter((w) => w.exterior);
    expect(ext.length).toBeGreaterThan(0);
    for (const w of ext) expect([1, -1]).toContain(w.openings[0]?.outward ?? 1);
  });
});

describe('太陽の置き方', () => {
  it('敷地が決まっていなければ、開口の外から入れる', () => {
    const b = buildBuilding(scene, 'noon')!;
    expect(b.sun.position[1]).toBeGreaterThan(0);
    expect(b.sun.intensity).toBeGreaterThan(0);
  });

  it('敷地があると、季節で高さが変わる', () => {
    const summer = buildBuilding(scene, 'noon', undefined, SITE, new Date(2026, 5, 21, 12))!;
    const winter = buildBuilding(scene, 'noon', undefined, SITE, new Date(2026, 11, 21, 12))!;
    expect(summer.sun.position[1]).toBeGreaterThan(winter.sun.position[1]);
  });

  it('夜は、ほとんど光を落とさない', () => {
    const night = buildBuilding(scene, 'night', undefined, SITE)!;
    const noon = buildBuilding(scene, 'noon', undefined, SITE)!;
    expect(night.sun.intensity).toBeLessThan(noon.sun.intensity / 5);
  });

  it('方位を回すと、太陽の向きも回る', () => {
    const a = buildBuilding(scene, 'noon', undefined, SITE, new Date(2026, 8, 23, 12))!;
    const b = buildBuilding(scene, 'noon', undefined, { ...SITE, rotationDeg: 90 }, new Date(2026, 8, 23, 12))!;
    const ang = (s: typeof a) => Math.atan2(s.sun.position[2] - s.bounds.cz, s.sun.position[0] - s.bounds.cx);
    expect(Math.abs(ang(a) - ang(b))).toBeGreaterThan(0.5);
  });

  it('太陽の様子を言葉にできる', () => {
    const t = describeSun(SITE, 'noon', new Date(2026, 8, 23, 12));
    expect(t).toMatch(/\d+:\d\d/);
    expect(t).toContain('高さ');
  });
});
