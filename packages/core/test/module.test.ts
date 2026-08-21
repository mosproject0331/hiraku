import { describe, expect, it } from 'vitest';
import { deserialize, estimateModule } from '../src/index';
import raw from '../fixtures/sample-minka.json';

describe('estimateModule', () => {
  it('910グリッドのサンプルは910と判定する', () => {
    const model = deserialize(JSON.stringify(raw));
    expect(estimateModule(model)).toBe(910);
  });

  it('955グリッドに拡大すると955と判定する', () => {
    const model = deserialize(JSON.stringify(raw));
    const k = 955 / 910;
    for (const n of model.levels[0]!.nodes) {
      n.x = Math.round(n.x * k);
      n.y = Math.round(n.y * k);
    }
    expect(estimateModule(model)).toBe(955);
  });

  it('壁が少なすぎるときは910を返す', () => {
    const model = deserialize(JSON.stringify(raw));
    model.levels[0]!.walls = model.levels[0]!.walls.slice(0, 2);
    expect(estimateModule(model)).toBe(910);
  });
});
