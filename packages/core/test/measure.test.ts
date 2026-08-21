import { describe, expect, it } from 'vitest';
import { deserialize, dist, solveConstraints, suggestNextMeasurements, type Measurement } from '../src/index';
import raw from '../fixtures/sample-minka.json';

function load() {
  return deserialize(JSON.stringify(raw));
}

function m(id: string, type: Measurement['type'], targetIds: string[], valueMm: number): Measurement {
  return { id, type, targetIds, valueMm, createdAt: '2026-08-22T00:00:00Z' };
}

describe('solveConstraints', () => {
  it('壁長の実測でノードが動き、確度がmeasuredになる', () => {
    const model = load();
    // w9 = 左辺 (0,5460)-(0,0)。実測5600mm
    const solved = solveConstraints(model, [m('m1', 'wallLength', ['w9'], 5600)]);
    const level = solved.levels[0]!;
    const w = level.walls.find((x) => x.id === 'w9')!;
    const a = level.nodes.find((n) => n.id === w.a)!;
    const b = level.nodes.find((n) => n.id === w.b)!;
    expect(Math.round(dist(a, b))).toBe(5600);
    expect(w.confidence).toBe('measured');
    expect(a.confidence).toBe('measured');
    expect(b.confidence).toBe('measured');
    // 元モデルは不変
    expect(model.levels[0]!.walls.find((x) => x.id === 'w9')!.confidence).toBe('estimated');
  });

  it('2本目の実測は確定済みノードを動かさない', () => {
    const model = load();
    const solved = solveConstraints(model, [
      m('m1', 'wallLength', ['w1'], 2800),
      m('m2', 'wallLength', ['w2'], 8300),
    ]);
    const level = solved.levels[0]!;
    const w1 = level.walls.find((x) => x.id === 'w1')!;
    const w2 = level.walls.find((x) => x.id === 'w2')!;
    const n = (id: string) => level.nodes.find((x) => x.id === id)!;
    expect(Math.round(dist(n(w1.a), n(w1.b)))).toBe(2800);
    expect(Math.round(dist(n(w2.a), n(w2.b)))).toBe(8300);
  });

  it('天井高と開口幅も反映される', () => {
    const model = load();
    const solved = solveConstraints(model, [
      m('m1', 'ceilingHeight', [], 2350),
      m('m2', 'openingWidth', ['o1'], 1250),
    ]);
    expect(solved.levels[0]!.heightMm).toBe(2350);
    const o = solved.levels[0]!.openings.find((x) => x.id === 'o1')!;
    expect(o.width).toBe(1250);
    expect(o.confidence).toBe('measured');
  });
});

describe('suggestNextMeasurements', () => {
  it('未計測の壁を3件+対角1件を提案する', () => {
    const s = suggestNextMeasurements(load(), []);
    expect(s.filter((x) => x.kind === 'wall')).toHaveLength(3);
    expect(s.filter((x) => x.kind === 'diagonal')).toHaveLength(1);
    for (const x of s) expect(x.reason.length).toBeGreaterThan(5);
  });

  it('計測済みの壁は提案から外れる', () => {
    const model = load();
    const first = suggestNextMeasurements(model, [])[0]!;
    const after = suggestNextMeasurements(model, [
      m('m1', 'wallLength', first.targetIds, 5000),
    ]);
    expect(after.find((x) => x.targetIds[0] === first.targetIds[0])).toBeUndefined();
  });
});
