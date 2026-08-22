import { describe, expect, it } from 'vitest';
import {
  deserialize, detectFaces, detectRooms, dist, distToEdges, interiorCameras,
  pointInPolygon, poleOfInaccessibility, type Level, type SpaceModel, type XY,
} from '../src/index';
import raw from '../fixtures/sample-minka.json';

/**
 * 仮説の検証：
 * 「部屋に点をまいて見える数を数える視点さがしは、対角線をとる従来のやり方より、
 *   部屋がよく写る」
 *
 * 主張しっぱなしにせず、同じ物差し（その視点から部屋の何割が見えるか）で測る。
 */

const model: SpaceModel = deserialize(JSON.stringify(raw));

/** 部屋の中に点をまく */
function samples(pts: XY[], step = 250): XY[] {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const out: XY[] = [];
  for (let x = Math.min(...xs) + step / 2; x < Math.max(...xs); x += step) {
    for (let y = Math.min(...ys) + step / 2; y < Math.max(...ys); y += step) {
      const p = { x, y };
      if (pointInPolygon(p, pts)) out.push(p);
    }
  }
  return out;
}

function sees(a: XY, b: XY, pts: XY[]): boolean {
  for (const t of [0.15, 0.3, 0.45, 0.6, 0.75, 0.9]) {
    if (!pointInPolygon({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, pts)) return false;
  }
  return true;
}

/** その視点から、部屋の何割が画面に入るか */
function coverage(stand: XY, look: XY, pts: XY[], fovDeg: number): number {
  const all = samples(pts);
  if (!all.length) return 0;
  const dx = look.x - stand.x;
  const dy = look.y - stand.y;
  const dl = Math.hypot(dx, dy) || 1;
  // 4:3 の画面を想定した水平半画角
  const half = Math.cos((Math.min(80, fovDeg * 1.33) / 2) * (Math.PI / 180));
  let seen = 0;
  for (const s of all) {
    const vx = s.x - stand.x;
    const vy = s.y - stand.y;
    const vl = Math.hypot(vx, vy);
    if (vl < 1) { seen++; continue; }
    if ((vx * dx + vy * dy) / (vl * dl) < half) continue;
    if (!sees(stand, s, pts)) continue;
    seen++;
  }
  return seen / all.length;
}

/** 従来のやり方：いちばん長い対角線の片端に立ち、反対の端を見る */
function diagonalCamera(pts: XY[]): { stand: XY; look: XY; fov: number } | null {
  let a = pts[0]!;
  let b = pts[1] ?? pts[0]!;
  let best = -1;
  for (const p of pts) {
    for (const q of pts) {
      const d = dist(p, q);
      if (d > best) { best = d; a = p; b = q; }
    }
  }
  const c = poleOfInaccessibility(pts);
  const ux = (c.x - a.x) / (dist(a, c) || 1);
  const uy = (c.y - a.y) / (dist(a, c) || 1);
  let stand = c;
  for (let inset = 300; inset <= Math.min(2200, best * 0.5); inset += 150) {
    const cand = { x: a.x + ux * inset, y: a.y + uy * inset };
    if (pointInPolygon(cand, pts) && distToEdges(cand, pts) >= 500) { stand = cand; break; }
  }
  const depth = dist(stand, b) / 1000;
  return { stand, look: b, fov: Math.max(44, Math.min(66, 78 - depth * 6)) };
}

/** その視点から、いちばん大きい窓が画面に入っているか */
function windowInFrame(stand: XY, look: XY, pts: XY[], fovDeg: number, win: XY | null): boolean {
  if (!win) return false;
  const dx = look.x - stand.x;
  const dy = look.y - stand.y;
  const dl = Math.hypot(dx, dy) || 1;
  const vx = win.x - stand.x;
  const vy = win.y - stand.y;
  const vl = Math.hypot(vx, vy) || 1;
  const half = Math.cos((Math.min(80, fovDeg * 1.33) / 2) * (Math.PI / 180));
  return (vx * dx + vy * dy) / (vl * dl) >= half;
}

describe('視点さがしの検証', () => {
  it('部屋の写る割合と、窓が入るかの両方で測る', () => {
    const level: Level = model.levels[0]!;
    const rooms = detectRooms(level);
    const faces = detectFaces(level);
    const nodeById = new Map(level.nodes.map((n) => [n.id, n] as const));
    const cams = interiorCameras(model, 99);

    const rows: { name: string; hasWindow: boolean; search: number; diagonal: number; winS: boolean; winD: boolean }[] = [];
    /** その部屋の、いちばん大きい窓の中心 */
    const bigWindow = (wallLoop: string[]): XY | null => {
      let best: { p: XY; w: number } | null = null;
      for (const wid of wallLoop) {
        const w = level.walls.find((x) => x.id === wid);
        if (!w) continue;
        const a = nodeById.get(w.a);
        const b = nodeById.get(w.b);
        if (!a || !b) continue;
        const len = dist(a, b);
        for (const o of level.openings.filter((x) => x.wallId === wid && x.kind === 'window')) {
          if (best && o.width <= best.w) continue;
          const t = (o.offset + o.width / 2) / len;
          best = { p: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, w: o.width };
        }
      }
      return best?.p ?? null;
    };
    rooms.forEach((r, i) => {
      const f = faces[i];
      if (!f || r.areaM2 < 3) return;
      const pts: XY[] = f.nodeIds.map((id) => nodeById.get(id)!).filter(Boolean);
      if (pts.length < 3) return;

      const cam = cams.find((c) => c.id === 'cam-' + r.id);
      if (!cam) return;
      const search = coverage(
        { x: cam.position[0] * 1000, y: cam.position[2] * 1000 },
        { x: cam.target[0] * 1000, y: cam.target[2] * 1000 },
        pts,
        cam.fovDeg,
      );
      const d = diagonalCamera(pts);
      const diagonal = d ? coverage(d.stand, d.look, pts, d.fov) : 0;
      const win = bigWindow(r.wallLoop);
      const camStand = { x: cam.position[0] * 1000, y: cam.position[2] * 1000 };
      const camLook = { x: cam.target[0] * 1000, y: cam.target[2] * 1000 };
      rows.push({
        name: r.name,
        hasWindow: win !== null,
        search,
        diagonal,
        winS: windowInFrame(camStand, camLook, pts, cam.fovDeg, win),
        winD: d ? windowInFrame(d.stand, d.look, pts, d.fov, win) : false,
      });
    });

    expect(rows.length).toBeGreaterThan(0);
    const avg = (k: 'search' | 'diagonal') => rows.reduce((s, x) => s + x[k], 0) / rows.length;
    // 実験の結果を残す（測ってから主張する）
    // 分母は「窓のある部屋」でなければ、勝手に低く見える
    const withWindow = rows.filter((r) => r.hasWindow).length;
    const winCount = (k: 'winS' | 'winD') => rows.filter((r) => r.hasWindow && r[k]).length;
    console.log(
      '\n視点の測り比べ（写る割合／窓が画面に入るか）\n' +
        rows
          .map(
            (r) =>
              `  ${r.name.padEnd(6)}${r.hasWindow ? '(窓あり)' : '(窓なし)'} ` +
              `探索 ${(r.search * 100).toFixed(0)}% ${r.hasWindow ? (r.winS ? '窓○' : '窓×') : '  '}` +
              `   対角線 ${(r.diagonal * 100).toFixed(0)}% ${r.hasWindow ? (r.winD ? '窓○' : '窓×') : ''}`,
          )
          .join('\n') +
        `\n  平均     探索 ${(avg('search') * 100).toFixed(0)}%  対角線 ${(avg('diagonal') * 100).toFixed(0)}%` +
        `\n  窓が入った部屋  探索 ${winCount('winS')}/${withWindow}  対角線 ${winCount('winD')}/${withWindow}\n`,
    );
    // 写る割合は互角以上で、窓が入る回数で上回ること
    expect(avg('search')).toBeGreaterThanOrEqual(avg('diagonal') - 0.02);
    expect(winCount('winS')).toBeGreaterThanOrEqual(winCount('winD'));
  });
});
