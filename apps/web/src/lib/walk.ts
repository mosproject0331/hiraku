import type { Building, WallBuild } from './archviz';

/**
 * 家の中を歩く。
 *
 * やることは二つだけ。壁をすり抜けさせないことと、戸のあるところは通すこと。
 * 壁に当たったら止めるのではなく、壁に沿って滑らせる。止まると操作が難しくなるため。
 */

export interface Blocker {
  ax: number; az: number;
  bx: number; bz: number;
  /** 壁の厚みの半分(m) */
  half: number;
  /**
   * 通り抜けられる範囲。壁に沿った距離(m)で、始点からの値。
   * 建具が入っていて、かつ足元が上がっていないところ。
   */
  gaps: [number, number][];
}

/** 人の目の高さ。日本人の平均的な身長からの目線 */
export const EYE_M = 1.5;
/** 体の半径。肩幅ぶん見ておく */
export const BODY_R = 0.24;
/** 歩く速さ m/s。実際の歩行は1.2〜1.4m/s */
export const WALK_MS = 1.25;
export const RUN_MS = 2.4;

/** 人が通り抜けられる建具か。またぐ高さがあるものは通さない */
function passable(sill: number, top: number): boolean {
  return sill <= 0.32 && top - sill >= 1.6;
}

export function wallBlocker(w: WallBuild): Blocker {
  const dx = Math.cos(w.angle);
  const dz = Math.sin(w.angle);
  const hx = (dx * w.len) / 2;
  const hz = (dz * w.len) / 2;
  const gaps: [number, number][] = [];
  for (const o of w.openings) {
    if (!passable(o.sill, o.top)) continue;
    // 開口の中心は壁の中心を0とした位置。始点からの距離に直す
    const s = w.len / 2 + o.cx;
    gaps.push([s - o.width / 2, s + o.width / 2]);
  }
  return {
    ax: w.cx - hx, az: w.cz - hz,
    bx: w.cx + hx, bz: w.cz + hz,
    half: w.thickness / 2,
    gaps,
  };
}

export function buildBlockers(b: Building): Blocker[] {
  return b.walls.map(wallBlocker);
}

interface Hit {
  /** 押し戻す向き（単位） */
  nx: number; nz: number;
  /** 押し戻す量(m) */
  push: number;
}

/** 点と壁の当たり。開口の中にいるときは当たらない */
function hitTest(x: number, z: number, r: number, b: Blocker): Hit | null {
  const dx = b.bx - b.ax;
  const dz = b.bz - b.az;
  const L2 = dx * dx + dz * dz;
  if (L2 < 1e-9) return null;
  let t = ((x - b.ax) * dx + (z - b.az) * dz) / L2;
  t = Math.max(0, Math.min(1, t));
  const px = b.ax + dx * t;
  const pz = b.az + dz * t;
  let vx = x - px;
  let vz = z - pz;
  let d = Math.hypot(vx, vz);
  const need = r + b.half;
  if (d >= need) return null;

  // 建具のところなら通す
  const s = t * Math.sqrt(L2);
  for (const [g0, g1] of b.gaps) {
    // 開口の縁でも肩がぶつからないよう、体の幅ぶん内側で判定する
    if (s > g0 + r && s < g1 - r) return null;
  }
  if (d < 1e-6) {
    // ちょうど芯の上。壁に直交する向きへ逃がす
    vx = -dz;
    vz = dx;
    d = Math.sqrt(L2);
  }
  return { nx: vx / d, nz: vz / d, push: need - d };
}

/**
 * from から to へ動かす。壁に当たったら壁沿いに滑らせる。
 *
 * 行き先だけを見ると、速く動いたときに壁を飛び越えてしまう。
 * だから体の半径より細かく刻んで、途中の位置ぜんぶで当てる。
 */
export function slide(
  fromX: number, fromZ: number,
  toX: number, toZ: number,
  blockers: Blocker[],
  r = BODY_R,
): { x: number; z: number; blocked: boolean } {
  const dx = toX - fromX;
  const dz = toZ - fromZ;
  const travel = Math.hypot(dx, dz);
  const steps = Math.max(1, Math.ceil(travel / (r * 0.7)));
  let x = fromX;
  let z = fromZ;
  let blocked = false;

  for (let i = 1; i <= steps; i++) {
    let nx = fromX + (dx * i) / steps;
    let nz = fromZ + (dz * i) / steps;
    // 角では2枚に同時に当たるので、収まるまで数回押し戻す
    for (let pass = 0; pass < 4; pass++) {
      let moved = false;
      for (const b of blockers) {
        const h = hitTest(nx, nz, r, b);
        if (!h) continue;
        nx += h.nx * h.push;
        nz += h.nz * h.push;
        moved = true;
        blocked = true;
      }
      if (!moved) break;
    }
    // 押し戻しで入る前より遠くへ飛んだら、その手前で止める
    if (Math.hypot(nx - x, nz - z) > travel / steps + r) {
      return { x, z, blocked: true };
    }
    x = nx;
    z = nz;
  }
  return { x, z, blocked };
}

/**
 * 見ている向きと入力から、平面のどちらへ進むかを出す。
 *
 * カメラは yaw=0 のとき -z を向いている。ここを取り違えると、
 * 前へ歩いたつもりで後ろへ下がり、壁に当たって動かなくなる。
 */
export function moveVector(yaw: number, mx: number, my: number): { x: number; z: number } {
  const s = Math.sin(yaw);
  const c = Math.cos(yaw);
  const x = -s * my + c * mx;
  const z = -c * my - s * mx;
  const n = Math.hypot(x, z);
  return n > 1e-6 ? { x: x / n, z: z / n } : { x: 0, z: 0 };
}

/** 入口から入る。玄関があればそこ、無ければいちばん広い部屋の真ん中 */
export function startPoint(b: Building): { x: number; z: number; yaw: number } {
  for (const w of b.walls) {
    const o = w.openings.find((x) => x.kind === 'entrance' && passable(x.sill, x.top));
    if (!o) continue;
    const dx = Math.cos(w.angle);
    const dz = Math.sin(w.angle);
    // 建具の位置から、部屋の側へ1m入る
    const ox = w.cx + dx * o.cx;
    const oz = w.cz + dz * o.cx;
    const inward = o.outward === 1 ? -1 : 1;
    const nx = -dz * inward;
    const nz = dx * inward;
    return {
      x: ox + nx * 1.0,
      z: oz + nz * 1.0,
      yaw: Math.atan2(-nx, -nz),
    };
  }
  const room = [...b.rooms].sort((p, q) => q.areaM2 - p.areaM2)[0];
  if (room && room.outline.length) {
    const cx = room.outline.reduce((s, p) => s + p.x, 0) / room.outline.length / 1000;
    const cz = room.outline.reduce((s, p) => s + p.y, 0) / room.outline.length / 1000;
    return { x: cx, z: cz, yaw: 0 };
  }
  return { x: b.bounds.cx, z: b.bounds.cz, yaw: 0 };
}
