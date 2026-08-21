import { describe, expect, it } from 'vitest';
import { deserialize, detectRooms } from '../src/index';
import raw from '../fixtures/sample-minka.json';

const model = deserialize(JSON.stringify(raw));
const level = model.levels[0]!;

describe('detectRooms', () => {
  it('サンプル間取りから5部屋を認識する', () => {
    const rooms = detectRooms(level);
    expect(rooms).toHaveLength(5);
  });

  it('面積の合計が外周面積と一致する', () => {
    const rooms = detectRooms(level);
    const total = rooms.reduce((s, r) => s + r.areaM2, 0);
    expect(total).toBeCloseTo((10920 * 5460) / 1e6, 1);
  });

  it('名前ヒントで部屋名が付き、面積・畳数が正しい', () => {
    const rooms = detectRooms(level);
    const doma = rooms.find((r) => r.name === '土間');
    expect(doma).toBeDefined();
    expect(doma!.areaM2).toBeCloseTo(14.91, 2);
    const washituA = rooms.find((r) => r.name === '和室A');
    expect(washituA).toBeDefined();
    expect(washituA!.areaM2).toBeCloseTo(12.42, 2);
    expect(washituA!.tatami).toBeCloseTo(7.7, 1);
  });

  it('壁が2枚だけ(閉じない)なら部屋は0', () => {
    const open = {
      ...level,
      walls: level.walls.slice(0, 2),
      rooms: [],
    };
    expect(detectRooms(open)).toHaveLength(0);
  });
});
