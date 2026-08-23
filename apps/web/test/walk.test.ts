import { describe, expect, it } from 'vitest';
import { moveVector, slide, wallBlocker, BODY_R, type Blocker } from '../src/lib/walk';
import type { WallBuild } from '../src/lib/archviz';

/** x軸に沿った長さ4m・厚さ0.12mの壁を z=0 に置く */
function wall(openings: WallBuild['openings'] = []): Blocker {
  return wallBlocker({
    id: 'w', cx: 0, cz: 0, angle: 0, len: 4, thickness: 0.12,
    panels: [], openings,
    finishPlus: {} as never, finishMinus: {} as never,
    exterior: false, traditional: false, structural: 'unknown',
  });
}

describe('壁をすり抜けない', () => {
  it('速く動いても飛び越えない', () => {
    const b = [wall()];
    // 1フレームで20m動かしても、壁の向こうへは行かない
    const r = slide(0, -10, 0, 10, b);
    expect(r.blocked).toBe(true);
    expect(r.z).toBeLessThan(0);
  });

  it('まっすぐ壁に向かうと止まる', () => {
    const b = [wall()];
    const r = slide(0, -1, 0, 1, b);
    expect(r.blocked).toBe(true);
    // 壁の手前（厚みの半分＋体の半径）で止まる
    expect(Math.abs(r.z)).toBeCloseTo(0.06 + BODY_R, 2);
    expect(r.z).toBeLessThan(0);
  });

  it('壁の無いところは通れる', () => {
    const b = [wall()];
    const r = slide(5, -1, 5, 1, b); // 壁は x=-2..2 なので範囲外
    expect(r.blocked).toBe(false);
    expect(r.z).toBeCloseTo(1, 5);
  });

  it('斜めに当たると壁沿いに滑る', () => {
    const b = [wall()];
    const r = slide(-1, -1, 0.5, 0.5, b);
    expect(r.blocked).toBe(true);
    // z は止められるが、x は進んでいる
    expect(r.x).toBeGreaterThan(-1);
    expect(r.z).toBeLessThan(0);
  });
});

describe('戸のあるところは通れる', () => {
  const door = [{ id: 'o', kind: 'door' as const, cx: 0, width: 1.6, sill: 0, top: 2.0, outward: 0 as const }];

  it('戸の正面は通り抜けられる', () => {
    const r = slide(0, -1, 0, 1, [wall(door)]);
    expect(r.blocked).toBe(false);
    expect(r.z).toBeCloseTo(1, 5);
  });

  it('戸の脇は通れない', () => {
    const r = slide(1.5, -1, 1.5, 1, [wall(door)]);
    expect(r.blocked).toBe(true);
  });

  it('肩がぶつかる縁ぎりぎりは通さない', () => {
    // 開口は x=-0.8..0.8。縁から体の半径ぶん内側までしか通さない
    const edge = 0.8 - BODY_R + 0.02;
    expect(slide(edge, -1, edge, 1, [wall(door)]).blocked).toBe(true);
    const inside = 0.8 - BODY_R - 0.05;
    expect(slide(inside, -1, inside, 1, [wall(door)]).blocked).toBe(false);
  });

  it('腰高の窓はまたげないので通さない', () => {
    const win = [{ id: 'o', kind: 'window' as const, cx: 0, width: 1.6, sill: 0.8, top: 2.0, outward: 1 as const }];
    expect(slide(0, -1, 0, 1, [wall(win)]).blocked).toBe(true);
  });

  it('掃出し窓は通れる', () => {
    const win = [{ id: 'o', kind: 'window' as const, cx: 0, width: 1.7, sill: 0.02, top: 2.0, outward: 1 as const }];
    expect(slide(0, -1, 0, 1, [wall(win)]).blocked).toBe(false);
  });
});

describe('角に挟まっても抜けない', () => {
  it('2枚の壁が交わる角に押し込んでも、壁の中には入らない', () => {
    const a = wall();
    const b = wallBlocker({
      id: 'w2', cx: 2, cz: 2, angle: Math.PI / 2, len: 4, thickness: 0.12,
      panels: [], openings: [],
      finishPlus: {} as never, finishMinus: {} as never,
      exterior: false, traditional: false, structural: 'unknown',
    });
    const r = slide(1, -1, 2.2, 0.2, [a, b]);
    // 壁Aを越えていない（越えたら z が正になる）
    expect(r.z).toBeLessThan(0);
    // 壁の芯に食い込んでいない
    expect(Math.abs(r.z)).toBeGreaterThan(0.06);
  });
});

describe('進む向き', () => {
  const near = (v: { x: number; z: number }, x: number, z: number) => {
    expect(v.x).toBeCloseTo(x, 5);
    expect(v.z).toBeCloseTo(z, 5);
  };

  it('正面を向いているとき、前は -z', () => {
    near(moveVector(0, 0, 1), 0, -1);
  });
  it('後ろは +z', () => {
    near(moveVector(0, 0, -1), 0, 1);
  });
  it('右は +x、左は -x', () => {
    near(moveVector(0, 1, 0), 1, 0);
    near(moveVector(0, -1, 0), -1, 0);
  });
  it('90度振り向けば、前の向きも90度回る', () => {
    near(moveVector(Math.PI / 2, 0, 1), -1, 0);
    near(moveVector(-Math.PI / 2, 0, 1), 1, 0);
    near(moveVector(Math.PI, 0, 1), 0, 1);
  });
  it('斜めでも長さは1（斜めが速くならない）', () => {
    const v = moveVector(0.7, 1, 1);
    expect(Math.hypot(v.x, v.z)).toBeCloseTo(1, 6);
  });
  it('入力が無ければ動かない', () => {
    near(moveVector(1.2, 0, 0), 0, 0);
  });
  it('前に進むと、見ている先に近づく', () => {
    // yaw=0 で前へ。カメラの視線 (0,0,-1) と同じ向き
    const v = moveVector(0, 0, 1);
    expect(v.x * 0 + v.z * -1).toBeGreaterThan(0.99);
  });
});
