import { describe, expect, it } from 'vitest';
import {
  buildRenovationScene,
  deserialize,
  detectRooms,
  interiorCameras,
  type RenovationOp,
} from '../src/index';
import raw from '../fixtures/sample-minka.json';

function load() {
  return deserialize(JSON.stringify(raw));
}

describe('改修シーンの組み立て', () => {
  it('部屋名から床の既定が決まる（土間・和室）', () => {
    const s = buildRenovationScene(load(), []);
    expect(s.rooms.find((r) => r.name === '土間')!.floor.id).toBe('doma');
    expect(s.rooms.find((r) => r.name === '和室A')!.floor.id).toBe('tatami_omote');
    expect(s.rooms.find((r) => r.name === '廊下')!.floor.id).toBe('as_is_floor');
  });

  it('仕上げのopsが材料表に反映され、言葉にもなる', () => {
    const model = load();
    const room = detectRooms(model.levels[0]!).find((r) => r.name === '和室A')!;
    const ops: RenovationOp[] = [
      { op: 'change_floor', roomId: room.id, finishId: 'flooring' },
      { op: 'change_wall_finish', roomId: room.id, finishId: 'shikkui_diy' },
    ];
    const s = buildRenovationScene(model, ops);
    const scene = s.rooms.find((r) => r.name === '和室A')!;
    expect(scene.floor.id).toBe('flooring');
    expect(scene.wall.id).toBe('shikkui_diy');
    expect(s.changes.join()).toContain('フローリング');
    expect(s.changes.join()).toContain('漆喰');
  });

  it('間仕切り撤去は部屋が減り、変化として言葉になる', () => {
    const model = load();
    const before = detectRooms(model.levels[0]!).length;
    const s = buildRenovationScene(model, [{ op: 'remove_partition', wallId: 'w15' }]);
    expect(s.rooms.length).toBe(before - 1);
    expect(s.changes[0]).toContain('撤去');
  });

  it('水回りの追加が部屋に紐づく', () => {
    const model = load();
    const doma = detectRooms(model.levels[0]!).find((r) => r.name === '土間')!;
    const s = buildRenovationScene(model, [
      { op: 'add_water_unit', roomId: doma.id, unit: 'kitchen', routeNote: '既存の近く' },
    ]);
    expect(s.rooms.find((r) => r.name === '土間')!.waterUnits).toEqual(['kitchen']);
  });

  it('壁を消した後でも、名前で部屋を突き合わせて仕上げを当てられる', () => {
    const model = load();
    const rooms = detectRooms(model.levels[0]!);
    const washitsuC = rooms.find((r) => r.name === '和室C')!;
    // 部屋idは撤去後に振り直されるが、名前で解決できること
    const s = buildRenovationScene(model, [
      { op: 'remove_partition', wallId: 'w15' },
      { op: 'change_floor', roomId: washitsuC.id, finishId: 'flooring' },
    ]);
    expect(s.rooms.find((r) => r.name === '和室C')!.floor.id).toBe('flooring');
  });
});

describe('室内カメラ', () => {
  it('目線の高さで、部屋の中に立つ', () => {
    const cams = interiorCameras(load());
    expect(cams.length).toBeGreaterThanOrEqual(1);
    for (const c of cams) {
      expect(c.position[1]).toBeCloseTo(1.45, 2);
      expect(c.fovDeg).toBeGreaterThan(40);
      expect(c.fovDeg).toBeLessThanOrEqual(66);
      // 視線は水平。建築写真として垂直線を倒さないため
      expect(c.target[1]).toBeCloseTo(c.position[1], 5);
      // 見る先は自分から離れている
      expect(Math.hypot(c.target[0] - c.position[0], c.target[2] - c.position[2])).toBeGreaterThan(1);
    }
  });

  it('カメラは部屋の内側にある（壁にめり込まない）', () => {
    const model = load();
    const cams = interiorCameras(model, 1);
    const level = model.levels[0]!;
    const xs = level.nodes.map((n) => n.x / 1000);
    const ys = level.nodes.map((n) => n.y / 1000);
    const c = cams[0]!;
    expect(c.position[0]).toBeGreaterThan(Math.min(...xs));
    expect(c.position[0]).toBeLessThan(Math.max(...xs));
    expect(c.position[2]).toBeGreaterThan(Math.min(...ys));
    expect(c.position[2]).toBeLessThan(Math.max(...ys));
  });

  it('部屋ごとに別の構図が返る', () => {
    const cams = interiorCameras(load(), 3);
    const keys = cams.map((c) => c.position.join(','));
    expect(new Set(keys).size).toBe(cams.length);
  });
});

describe('L字の部屋でもカメラが室内に立つ', () => {
  it('間仕切りを撤去してL字になっても、壁の中に入らない', async () => {
    const { pointInPolygon, distToEdges, detectFaces } = await import('../src/index');
    const model = load();
    const inner = model.levels[0]!.walls.find((w) => w.structural === 'unknown')!;
    const s = buildRenovationScene(model, [{ op: 'remove_partition', wallId: inner.id }]);
    const level = s.model.levels[0]!;
    const nodeById = new Map(level.nodes.map((n) => [n.id, n] as const));
    const faces = detectFaces(level);

    expect(s.cameras.length).toBeGreaterThan(0);
    s.cameras.forEach((cam, i) => {
      const f = faces[i];
      if (!f) return;
      const poly = f.nodeIds.map((id) => nodeById.get(id)!).filter(Boolean);
      const p = { x: cam.position[0] * 1000, y: cam.position[2] * 1000 };
      expect(pointInPolygon(p, poly)).toBe(true);
      // 壁にめり込まない余裕がある
      expect(distToEdges(p, poly)).toBeGreaterThanOrEqual(400);
    });
  });

  it('凹んだ多角形でも内部の点が返る', async () => {
    const { poleOfInaccessibility, pointInPolygon } = await import('../src/index');
    // L字
    const L = [
      { x: 0, y: 0 }, { x: 6000, y: 0 }, { x: 6000, y: 2000 },
      { x: 2000, y: 2000 }, { x: 2000, y: 6000 }, { x: 0, y: 6000 },
    ];
    const p = poleOfInaccessibility(L);
    expect(pointInPolygon(p, L)).toBe(true);
  });
});
