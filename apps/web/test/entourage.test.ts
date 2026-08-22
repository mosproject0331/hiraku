import { describe, expect, it } from 'vitest';
import { buildRenovationScene, deserialize } from '@hiraku/core';
import sample from '@hiraku/core/fixtures/sample-minka.json';
import { layoutPlants, layoutProps } from '@/lib/entourage';
import { buildBuilding } from '@/lib/archviz';

const model = deserialize(JSON.stringify(sample));
const scene = buildRenovationScene(model, []);
const building = buildBuilding(scene)!;

describe('添景の置き方', () => {
  it('用途で置くものが変わる', () => {
    const cafe = layoutProps(building.rooms, 'cafe').map((p) => p.kind);
    const stay = layoutProps(building.rooms, 'minpaku').map((p) => p.kind);
    expect(cafe).toContain('counter');
    expect(stay).toContain('lowTable');
    expect(new Set(cafe)).not.toEqual(new Set(stay));
  });

  it('同じ条件なら、いつも同じ配置になる', () => {
    const a = JSON.stringify(layoutProps(building.rooms, 'cafe'));
    const b = JSON.stringify(layoutProps(building.rooms, 'cafe'));
    expect(a).toBe(b);
  });

  it('カメラの前には置かない', () => {
    const cam = scene.cameras[0]!;
    const avoid = [{ x: cam.position[0], z: cam.position[2], r: 1.4 }];
    for (const p of layoutProps(building.rooms, 'cafe', avoid)) {
      // 吊り下げの照明は天井なので、床の家具だけ見る
      if (p.kind === 'pendant') continue;
      expect(Math.hypot(p.x - cam.position[0], p.z - cam.position[2])).toBeGreaterThanOrEqual(1.4);
    }
  });

  it('緑は建物の外にだけ置く', () => {
    const b = building.bounds;
    for (const p of layoutPlants(building.windows, b)) {
      const inside = p.x > b.minX - 0.6 && p.x < b.maxX + 0.6 && p.z > b.minZ - 0.6 && p.z < b.maxZ + 0.6;
      expect(inside).toBe(false);
    }
  });
});
