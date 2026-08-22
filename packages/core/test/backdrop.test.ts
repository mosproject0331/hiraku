import { describe, expect, it } from 'vitest';
import {
  backdropSizeMm,
  calibrateBackdrop,
  deserialize,
  initialBackdrop,
  serialize,
} from '../src/index';
import raw from '../fixtures/sample-minka.json';

describe('下絵', () => {
  it('初期状態は指定幅に合う倍率になる', () => {
    const b = initialBackdrop('/x.jpg', 1000, 500, 9100);
    expect(b.mmPerPx).toBeCloseTo(9.1, 5);
    expect(backdropSizeMm(b)).toEqual({ widthMm: 9100, heightMm: 4550 });
  });

  it('実寸合わせで倍率が変わり、基準点は動かない', () => {
    const b = initialBackdrop('/x.jpg', 1000, 500, 9100);
    // 図面上で 1000mm 離れて見える2点が、実際は 3640mm だった
    const p1 = { x: 2000, y: 1000 };
    const p2 = { x: 3000, y: 1000 };
    const c = calibrateBackdrop(b, p1, p2, 3640);
    expect(c.mmPerPx).toBeCloseTo(9.1 * 3.64, 4);
    // p1 が下絵上で指していた位置は変わらない
    const before = (p1.x - b.x) / b.mmPerPx;
    const after = (p1.x - c.x) / c.mmPerPx;
    expect(after).toBeCloseTo(before, 6);
  });

  it('退化した入力では何もしない', () => {
    const b = initialBackdrop('/x.jpg', 1000, 500);
    expect(calibrateBackdrop(b, { x: 0, y: 0 }, { x: 0, y: 0 }, 3640)).toEqual(b);
    expect(calibrateBackdrop(b, { x: 0, y: 0 }, { x: 100, y: 0 }, 0)).toEqual(b);
  });

  it('シリアライズを往復しても下絵が残る', () => {
    const m = deserialize(JSON.stringify(raw));
    m.levels[0]!.backdrop = initialBackdrop('/api/media/abc/0.jpg', 1600, 900, 10920);
    const again = deserialize(serialize(m));
    expect(again.levels[0]!.backdrop).toEqual(m.levels[0]!.backdrop);
  });
});
