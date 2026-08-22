import { describe, expect, it } from 'vitest';
import type { Roof } from '@hiraku/core';
import { buildRoof, ceilingHeightAt } from '@/lib/roof';

const BOX = { minX: 0, maxX: 8, minZ: 0, maxZ: 6 };
const WALL_TOP = 2.4;

function roof(over: Partial<Roof> = {}): Roof {
  return { shape: 'gable', pitchSun: 4, eaveMm: 600, ridge: 'x', material: 'kawara', exposeCeiling: false, ...over };
}

describe('屋根の形', () => {
  it('軒の出が、屋根の外形を広げる', () => {
    const none = buildRoof(BOX, WALL_TOP, roof({ eaveMm: 0 }));
    const deep = buildRoof(BOX, WALL_TOP, roof({ eaveMm: 900 }));
    expect(none.box.minX).toBe(0);
    expect(deep.box.minX).toBeCloseTo(-0.9, 5);
    expect(deep.box.maxZ).toBeCloseTo(6.9, 5);
  });

  it('勾配が急なほど、棟が高くなる', () => {
    const flatish = buildRoof(BOX, WALL_TOP, roof({ pitchSun: 2 }));
    const steep = buildRoof(BOX, WALL_TOP, roof({ pitchSun: 8 }));
    expect(steep.ridgeY).toBeGreaterThan(flatish.ridgeY);
    // 4寸・軒600 なら、棟は軒から (6/2+0.6)*0.4 ＝ 1.44m 上
    const g = buildRoof(BOX, WALL_TOP, roof());
    expect(g.ridgeY - g.eaveY).toBeCloseTo(1.44, 2);
  });

  it('棟の向きで、上がる方向が変わる', () => {
    const x = buildRoof(BOX, WALL_TOP, roof({ ridge: 'x' })); // 短辺(6+1.2)で上がる
    const y = buildRoof(BOX, WALL_TOP, roof({ ridge: 'y' })); // 長辺(8+1.2)で上がる
    expect(y.ridgeY).toBeGreaterThan(x.ridgeY);
  });

  it('形ごとに面ができ、切妻には妻壁がつく', () => {
    for (const shape of ['gable', 'hip', 'shed', 'flat'] as const) {
      const r = buildRoof(BOX, WALL_TOP, roof({ shape }));
      expect(r.geometry.attributes.position!.count, shape).toBeGreaterThan(0);
      expect(r.geometry.attributes.normal!.count, shape).toBe(r.geometry.attributes.position!.count);
    }
    expect(buildRoof(BOX, WALL_TOP, roof({ shape: 'gable' })).gableGeometry).not.toBeNull();
    expect(buildRoof(BOX, WALL_TOP, roof({ shape: 'hip' })).gableGeometry).toBeNull();
  });

  it('陸屋根は、ほとんど上がらない', () => {
    const r = buildRoof(BOX, WALL_TOP, roof({ shape: 'flat' }));
    expect(r.ridgeY - WALL_TOP).toBeLessThan(0.4);
  });
});

describe('小屋裏の天井高', () => {
  it('切妻は、棟の下でいちばん高い', () => {
    const r = buildRoof(BOX, WALL_TOP, roof());
    const centre = ceilingHeightAt(4, 3, r, roof());
    const edge = ceilingHeightAt(4, 0.1, r, roof());
    expect(centre).toBeGreaterThan(edge);
    expect(centre).toBeLessThanOrEqual(r.ridgeY);
  });

  it('片流れは、片側だけ高い', () => {
    const cfg = roof({ shape: 'shed' });
    const r = buildRoof(BOX, WALL_TOP, cfg);
    expect(ceilingHeightAt(4, 0.1, r, cfg)).toBeGreaterThan(ceilingHeightAt(4, 5.9, r, cfg));
  });

  it('寄棟は、四隅とも下がる', () => {
    const cfg = roof({ shape: 'hip' });
    const r = buildRoof(BOX, WALL_TOP, cfg);
    const centre = ceilingHeightAt(4, 3, r, cfg);
    for (const [x, z] of [[0.2, 0.2], [7.8, 0.2], [0.2, 5.8], [7.8, 5.8]]) {
      expect(ceilingHeightAt(x!, z!, r, cfg)).toBeLessThan(centre);
    }
  });

  it('どこでも、屋根の棟より高くはならない', () => {
    const cfg = roof();
    const r = buildRoof(BOX, WALL_TOP, cfg);
    for (let x = -1; x <= 9; x += 0.5) {
      for (let z = -1; z <= 7; z += 0.5) {
        expect(ceilingHeightAt(x, z, r, cfg)).toBeLessThanOrEqual(r.ridgeY);
      }
    }
  });
});
