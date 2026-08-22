import { describe, expect, it } from 'vitest';
import { capturePreset, profileFor } from '@/lib/quality';
import { LAYERS, tileUrl } from '@/lib/gsi';

describe('描画の重さ', () => {
  it('段が上がるほど、重くなる', () => {
    const low = profileFor('low');
    const mid = profileFor('mid');
    const high = profileFor('high');
    expect(low.shadowMap).toBeLessThan(mid.shadowMap);
    expect(mid.shadowMap).toBeLessThan(high.shadowMap);
    expect(low.texSize).toBeLessThanOrEqual(mid.texSize);
    expect(low.ao).toBe(false);
    expect(high.ao).toBe(true);
  });

  it('環境遮蔽を使うときは、MSAAを併用しない（真っ白になるため）', () => {
    for (const t of ['low', 'mid', 'high'] as const) {
      const p = profileFor(t);
      if (p.ao) expect(p.msaa).toBe(0);
    }
  });

  it('書き出しは、端末に関わらず上げ切る', () => {
    const cap = capturePreset(profileFor('low'));
    expect(cap.ao).toBe(true);
    expect(cap.shadows).toBe(true);
    expect(cap.dprMax).toBeGreaterThanOrEqual(2);
  });
});

describe('地理院タイル', () => {
  it('航空写真と地図で、別の道を引く', () => {
    expect(tileUrl('photo', 18, 1, 2)).toContain('seamlessphoto');
    expect(tileUrl('map', 18, 1, 2)).toContain('pale');
    expect(tileUrl('photo', 18, 1, 2)).toMatch(/\/18\/1\/2\.jpg$/);
  });

  it('ズームの上限は18（それ以上は引き伸ばして使う）', () => {
    for (const l of LAYERS) expect(l.maxZoom).toBe(18);
  });
});
