import { describe, expect, it } from 'vitest';
import { deserialize, snapToGrid } from '../src/index';
import raw from '../fixtures/sample-minka.json';

function load() {
  return deserialize(JSON.stringify(raw));
}

describe('snapToGrid', () => {
  it('許容内のズレはグリッドへ吸着し hypothesis に昇格する', () => {
    const model = load();
    const n = model.levels[0]!.nodes[0]!;
    n.x += 27;
    const snapped = snapToGrid(model, 910, 50);
    const sn = snapped.levels[0]!.nodes[0]!;
    expect(sn.x % 910).toBe(0);
    expect(sn.confidence).toBe('hypothesis');
    // 元モデルは不変
    expect(model.levels[0]!.nodes[0]!.x % 910).not.toBe(0);
  });

  it('measured のノードは動かさない', () => {
    const model = load();
    const n = model.levels[0]!.nodes[1]!;
    n.x += 30;
    n.confidence = 'measured';
    const snapped = snapToGrid(model, 910, 50);
    const sn = snapped.levels[0]!.nodes[1]!;
    expect(sn.x).toBe(n.x);
    expect(sn.confidence).toBe('measured');
  });

  it('許容を超えるズレは動かさない', () => {
    const model = load();
    const n = model.levels[0]!.nodes[2]!;
    n.x += 200;
    const snapped = snapToGrid(model, 910, 50);
    expect(snapped.levels[0]!.nodes[2]!.x).toBe(n.x);
  });
});
