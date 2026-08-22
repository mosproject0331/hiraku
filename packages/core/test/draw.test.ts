import { describe, expect, it } from 'vitest';
import {
  addLevel, addRectangle, alignWall, applyOps, detectRooms, dist, extendWall, headingVector,
  mergeNearbyNodes, moveNode, orthogonalize, removeLevel, setWallLength, takeoff,
  totalFloorAreaM2, usedIds, vectorHeading, type SpaceModel,
} from '../src/index';

function empty(): SpaceModel {
  return {
    id: 't',
    levels: [{ id: 'L1', name: '1階', heightMm: 2400, walls: [], nodes: [], openings: [], rooms: [] }],
    moduleMm: 910,
    scaleFactor: 1,
    version: 1,
  };
}

function withNode(x = 0, y = 0): SpaceModel {
  const m = empty();
  m.levels[0]!.nodes.push({ id: 'n1', x, y, confidence: 'measured' });
  return m;
}

describe('向きの取り決め', () => {
  it('0度が右、90度が下（画面と同じ向き）', () => {
    expect(headingVector(0).x).toBeCloseTo(1);
    expect(headingVector(0).y).toBeCloseTo(0);
    expect(headingVector(90).y).toBeCloseTo(1);
    expect(headingVector(270).y).toBeCloseTo(-1);
  });

  it('2点から向きを戻せる', () => {
    expect(vectorHeading({ x: 0, y: 0 }, { x: 100, y: 0 })).toBeCloseTo(0);
    expect(vectorHeading({ x: 0, y: 0 }, { x: 0, y: 100 })).toBeCloseTo(90);
    expect(vectorHeading({ x: 0, y: 0 }, { x: -100, y: 0 })).toBeCloseTo(180);
  });
});

describe('長さと向きで壁をのばす', () => {
  it('打ち込んだ寸法どおりの壁ができる', () => {
    const r = extendWall(withNode(), 'n1', 3640, 0);
    const lv = r.model.levels[0]!;
    expect(lv.walls).toHaveLength(1);
    const a = lv.nodes.find((n) => n.id === 'n1')!;
    const b = lv.nodes.find((n) => n.id === r.nodeId)!;
    expect(dist(a, b)).toBeCloseTo(3640, 0);
    expect(b.x).toBe(3640);
    expect(b.y).toBe(0);
    expect(lv.walls[0]!.confidence).toBe('measured');
  });

  it('同じ場所に頂点があれば使い回して輪を閉じられる', () => {
    let m = withNode();
    let r = extendWall(m, 'n1', 1820, 0);
    r = extendWall(r.model, r.nodeId, 1820, 90);
    r = extendWall(r.model, r.nodeId, 1820, 180);
    r = extendWall(r.model, r.nodeId, 1820, 270);
    const lv = r.model.levels[0]!;
    expect(lv.nodes).toHaveLength(4);
    expect(lv.walls).toHaveLength(4);
    expect(r.nodeId).toBe('n1');
    void m;
  });

  it('長さが0以下なら何もしない', () => {
    const r = extendWall(withNode(), 'n1', 0, 0);
    expect(r.model.levels[0]!.walls).toHaveLength(0);
  });
});

describe('長方形をつくる', () => {
  it('幅×奥行の4面がそろう', () => {
    const r = addRectangle(empty(), { x: 0, y: 0 }, 3640, 2730);
    const lv = r.model.levels[0]!;
    expect(lv.nodes).toHaveLength(4);
    expect(lv.walls).toHaveLength(4);
    const xs = lv.nodes.map((n) => n.x);
    const ys = lv.nodes.map((n) => n.y);
    expect(Math.max(...xs) - Math.min(...xs)).toBe(3640);
    expect(Math.max(...ys) - Math.min(...ys)).toBe(2730);
  });

  it('隣に足すと辺を共有する', () => {
    const first = addRectangle(empty(), { x: 0, y: 0 }, 3640, 2730);
    const second = addRectangle(first.model, { x: 3640, y: 0 }, 2730, 2730);
    const lv = second.model.levels[0]!;
    expect(lv.nodes).toHaveLength(6); // 4 + 2（2点は共有）
    expect(lv.walls).toHaveLength(7); // 4 + 3（1辺は共有）
  });
});

describe('壁の長さを数値で決め直す', () => {
  it('片方の端を固定して伸ばす', () => {
    const r = extendWall(withNode(), 'n1', 1000, 0);
    const m = setWallLength(r.model, r.model.levels[0]!.walls[0]!.id, 3640, 'a');
    const lv = m.levels[0]!;
    const a = lv.nodes.find((n) => n.id === 'n1')!;
    const b = lv.nodes.find((n) => n.id !== 'n1')!;
    expect(a.x).toBe(0);
    expect(dist(a, b)).toBeCloseTo(3640, 0);
  });

  it('中央を固定すると両端が動く', () => {
    const r = extendWall(withNode(), 'n1', 1000, 0);
    const m = setWallLength(r.model, r.model.levels[0]!.walls[0]!.id, 2000, 'center');
    const lv = m.levels[0]!;
    const xs = lv.nodes.map((n) => n.x).sort((p, q) => p - q);
    expect(xs[0]).toBe(-500);
    expect(xs[1]).toBe(1500);
  });
});

describe('壁をそろえる', () => {
  it('傾いた壁を、長さを変えずに水平にする', () => {
    const m0 = withNode();
    m0.levels[0]!.nodes.push({ id: 'n2', x: 3000, y: 220, confidence: 'estimated' });
    m0.levels[0]!.walls.push({ id: 'w1', a: 'n1', b: 'n2', thickness: 120, confidence: 'estimated', structural: 'unknown' });
    const before = dist(m0.levels[0]!.nodes[0]!, m0.levels[0]!.nodes[1]!);
    const m = alignWall(m0, 'w1', 'auto');
    const [a, b] = m.levels[0]!.nodes;
    expect(b!.y).toBe(a!.y);
    expect(dist(a!, b!)).toBeCloseTo(before, 0);
  });
});

describe('直角にそろえる', () => {
  it('数度ずれた四角形が、角のはずれないまま直角になる', () => {
    const m = empty();
    const lv = m.levels[0]!;
    lv.nodes.push(
      { id: 'n1', x: 0, y: 0, confidence: 'estimated' },
      { id: 'n2', x: 3640, y: 90, confidence: 'estimated' },
      { id: 'n3', x: 3700, y: 2730, confidence: 'estimated' },
      { id: 'n4', x: 60, y: 2680, confidence: 'estimated' },
    );
    lv.walls.push(
      { id: 'w1', a: 'n1', b: 'n2', thickness: 120, confidence: 'estimated', structural: 'unknown' },
      { id: 'w2', a: 'n2', b: 'n3', thickness: 120, confidence: 'estimated', structural: 'unknown' },
      { id: 'w3', a: 'n3', b: 'n4', thickness: 120, confidence: 'estimated', structural: 'unknown' },
      { id: 'w4', a: 'n4', b: 'n1', thickness: 120, confidence: 'estimated', structural: 'unknown' },
    );
    const out = orthogonalize(m);
    const n = new Map(out.levels[0]!.nodes.map((v) => [v.id, v]));
    expect(n.get('n1')!.y).toBe(n.get('n2')!.y);
    expect(n.get('n3')!.y).toBe(n.get('n4')!.y);
    expect(n.get('n2')!.x).toBe(n.get('n3')!.x);
    expect(n.get('n4')!.x).toBe(n.get('n1')!.x);
    // 4本の壁は残る（角がほどけない）
    expect(out.levels[0]!.walls).toHaveLength(4);
  });

  it('実測として入れた頂点は動かさない', () => {
    const m = empty();
    const lv = m.levels[0]!;
    lv.nodes.push(
      { id: 'n1', x: 0, y: 0, confidence: 'measured' },
      { id: 'n2', x: 3640, y: 120, confidence: 'estimated' },
    );
    lv.walls.push({ id: 'w1', a: 'n1', b: 'n2', thickness: 120, confidence: 'estimated', structural: 'unknown' });
    const out = orthogonalize(m);
    const n = new Map(out.levels[0]!.nodes.map((v) => [v.id, v]));
    expect(n.get('n1')!.y).toBe(0);
    expect(n.get('n2')!.y).toBe(0);
  });

  it('斜めの壁（45度）はそのまま', () => {
    const m = empty();
    const lv = m.levels[0]!;
    lv.nodes.push(
      { id: 'n1', x: 0, y: 0, confidence: 'estimated' },
      { id: 'n2', x: 2000, y: 2000, confidence: 'estimated' },
    );
    lv.walls.push({ id: 'w1', a: 'n1', b: 'n2', thickness: 120, confidence: 'estimated', structural: 'unknown' });
    const out = orthogonalize(m);
    expect(out.levels[0]!.nodes[1]!.y).toBe(2000);
  });
});

describe('頂点をまとめる', () => {
  it('ほぼ同じ位置の頂点をひとつにし、重複した壁を落とす', () => {
    const m = empty();
    const lv = m.levels[0]!;
    lv.nodes.push(
      { id: 'n1', x: 0, y: 0, confidence: 'estimated' },
      { id: 'n2', x: 3640, y: 0, confidence: 'estimated' },
      { id: 'n3', x: 3660, y: 15, confidence: 'estimated' },
      { id: 'n4', x: 3660, y: 2730, confidence: 'estimated' },
    );
    lv.walls.push(
      { id: 'w1', a: 'n1', b: 'n2', thickness: 120, confidence: 'estimated', structural: 'unknown' },
      { id: 'w2', a: 'n3', b: 'n4', thickness: 120, confidence: 'estimated', structural: 'unknown' },
    );
    const out = mergeNearbyNodes(m, 60);
    expect(out.levels[0]!.nodes).toHaveLength(3);
    expect(out.levels[0]!.walls).toHaveLength(2);
    expect(out.levels[0]!.walls[1]!.a).toBe('n2');
  });
});

describe('頂点を座標で置き直す', () => {
  it('打ち込んだ座標になり、実測として扱われる', () => {
    const out = moveNode(withNode(10, 10), 'n1', 1820, 910);
    const n = out.levels[0]!.nodes[0]!;
    expect(n.x).toBe(1820);
    expect(n.y).toBe(910);
    expect(n.confidence).toBe('measured');
  });
});

describe('既存の壁の上に点が乗ったとき', () => {
  it('その壁を割ってつなぐので、部屋の認識が壊れない', () => {
    // 6畳の部屋をつくる
    let r = extendWall(withNode(), 'n1', 3640, 0);
    r = extendWall(r.model, r.nodeId, 2730, 90);
    r = extendWall(r.model, r.nodeId, 3640, 180);
    r = extendWall(r.model, r.nodeId, 2730, 270);
    // 下の辺の途中(1820, 2730)から、下に部屋をぶら下げる
    const n4 = r.model.levels[0]!.nodes.find((n) => n.x === 0 && n.y === 2730)!;
    let s = extendWall(r.model, n4.id, 1820, 0); // 既存の壁の上に乗る
    s = extendWall(s.model, s.nodeId, 2730, 90);
    s = extendWall(s.model, s.nodeId, 1820, 180);
    s = extendWall(s.model, s.nodeId, 2730, 270);

    const lv = s.model.levels[0]!;
    const rooms = detectRooms(lv);
    const areas = rooms.map((x) => Math.round(x.areaM2 * 100) / 100).sort((a, b) => a - b);
    expect(areas).toEqual([4.97, 9.94]);
    // どの部屋も、この建物の外接矩形より大きくならない
    for (const a of areas) expect(a).toBeLessThan(30);
  });
});

describe('壊れた図面でも止まらない', () => {
  it('壁が重なっていても、面の探索が終わる', () => {
    const m = empty();
    const lv = m.levels[0]!;
    lv.nodes.push(
      { id: 'n1', x: 0, y: 0, confidence: 'estimated' },
      { id: 'n2', x: 3640, y: 0, confidence: 'estimated' },
      { id: 'n3', x: 1820, y: 0, confidence: 'estimated' },
      { id: 'n4', x: 1820, y: 2730, confidence: 'estimated' },
    );
    // w1 は n3 を通り越して重なっている（割られていない）
    lv.walls.push(
      { id: 'w1', a: 'n1', b: 'n2', thickness: 120, confidence: 'estimated', structural: 'unknown' },
      { id: 'w2', a: 'n1', b: 'n3', thickness: 120, confidence: 'estimated', structural: 'unknown' },
      { id: 'w3', a: 'n3', b: 'n4', thickness: 120, confidence: 'estimated', structural: 'unknown' },
    );
    const t0 = Date.now();
    const rooms = detectRooms(lv);
    expect(Date.now() - t0).toBeLessThan(1000);
    for (const r of rooms) expect(r.areaM2).toBeLessThan(100);
  });
});

describe('2階建て', () => {
  function twoStorey(): SpaceModel {
    // 1階に6畳をつくり、その外周を写して2階を足す
    let r = extendWall(withNode(), 'n1', 3640, 0);
    r = extendWall(r.model, r.nodeId, 2730, 90);
    r = extendWall(r.model, r.nodeId, 3640, 180);
    r = extendWall(r.model, r.nodeId, 2730, 270);
    return addLevel(r.model, 0);
  }

  it('階を足すと、外周が写り、idは重ならない', () => {
    const m = twoStorey();
    expect(m.levels).toHaveLength(2);
    expect(m.levels[1]!.name).toBe('2階');
    expect(m.levels[1]!.walls).toHaveLength(4);
    const ids = usedIds(m);
    const count = m.levels.flatMap((lv) => [...lv.nodes, ...lv.walls].map((x) => x.id)).length;
    expect(ids.size).toBeGreaterThanOrEqual(count); // 重複していれば size が小さくなる
    const all = m.levels.flatMap((lv) => [...lv.nodes, ...lv.walls].map((x) => x.id));
    expect(new Set(all).size).toBe(all.length);
  });

  it('写した階は仮説として扱う（実測ではない）', () => {
    const m = twoStorey();
    for (const n of m.levels[1]!.nodes) expect(n.confidence).toBe('hypothesis');
  });

  it('面積は全階を合算する', () => {
    const m = twoStorey();
    expect(totalFloorAreaM2(m)).toBeCloseTo(9.94 * 2, 1);
    expect(takeoff(m).totalFloorM2).toBeCloseTo(9.94 * 2, 1);
    expect(takeoff(m).rooms).toHaveLength(2);
    expect(takeoff(m).rooms.map((r) => r.levelName).sort()).toEqual(['1階', '2階']);
  });

  it('2階の壁も、idで見つけて撤去できる', () => {
    const m = twoStorey();
    const upper = m.levels[1]!.walls[0]!.id;
    const after = applyOps(m, [{ op: 'remove_partition', wallId: upper }]);
    expect(after.levels[0]!.walls).toHaveLength(4); // 1階は無傷
    expect(after.levels[1]!.walls).toHaveLength(3);
  });

  it('2階に数値で壁を引ける', () => {
    const m = twoStorey();
    const start = m.levels[1]!.nodes[0]!.id;
    const r = extendWall(m, start, 1820, 270);
    expect(r.model.levels[0]!.walls).toHaveLength(4);
    expect(r.model.levels[1]!.walls).toHaveLength(5);
  });

  it('直角そろえは、どの階にも効く', () => {
    const m = twoStorey();
    m.levels[1]!.nodes[1]!.y = 90; // 2階だけ歪ませる
    const out = orthogonalize(m);
    const n = out.levels[1]!.nodes;
    expect(n[0]!.y).toBe(n[1]!.y);
  });

  it('1階は外せない', () => {
    const m = twoStorey();
    expect(removeLevel(m, 0).levels).toHaveLength(2);
    expect(removeLevel(m, 1).levels).toHaveLength(1);
  });
});
