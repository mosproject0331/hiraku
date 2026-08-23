import type { RenovationOp, Room, SpaceModel } from './types';
import { dist, distToEdges, pointInPolygon, poleOfInaccessibility, type XY } from './geometry';
import { detectFaces, detectRooms } from './rooms';
import { levelBaseY } from './levels';
import { applyOps } from './ops';

/** 仕上げ材の見た目。パース生成の条件画像に使う */
export interface Finish {
  id: string;
  label: string;
  color: string;
  /** 0=鏡面 1=完全な拡散。three.js の roughness */
  roughness: number;
  /** 写実化のプロンプトに渡す素材の言葉 */
  phrase: string;
}

export const FINISHES: Record<string, Finish> = {
  flooring:      { id: 'flooring',      label: 'フローリング',   color: '#b08654', roughness: 0.55, phrase: 'warm oak flooring with visible grain' },
  cushion_floor: { id: 'cushion_floor', label: 'クッションフロア', color: '#c8b89a', roughness: 0.7,  phrase: 'matte vinyl sheet flooring' },
  tatami_omote:  { id: 'tatami_omote',  label: '畳',            color: '#c3c88a', roughness: 0.9,  phrase: 'fresh tatami mats with cloth borders' },
  doma:          { id: 'doma',          label: '土間',          color: '#6f6257', roughness: 0.85, phrase: 'polished earthen doma floor (tataki)' },
  cloth:         { id: 'cloth',         label: 'クロス',        color: '#efeae2', roughness: 0.95, phrase: 'plain off-white wall covering' },
  shikkui_diy:   { id: 'shikkui_diy',   label: '漆喰',          color: '#f3efe6', roughness: 1.0,  phrase: 'hand-troweled shikkui plaster with soft texture' },
  paint:         { id: 'paint',         label: '塗装',          color: '#e8e4dc', roughness: 0.9,  phrase: 'matte painted wall' },
  ceiling_paint: { id: 'ceiling_paint', label: '天井塗装',      color: '#f2efe9', roughness: 0.95, phrase: 'matte painted ceiling' },
  ceiling_board: { id: 'ceiling_board', label: '天井板',        color: '#a98e6b', roughness: 0.7,  phrase: 'exposed timber ceiling boards' },
  siding_wood:   { id: 'siding_wood',   label: '下見板',        color: '#6f5a44', roughness: 0.82, phrase: 'weathered horizontal timber siding (shitami-ita)' },
  mortar_out:    { id: 'mortar_out',    label: 'モルタル',      color: '#b9b3a8', roughness: 0.92, phrase: 'grey mortar render, lightly stained' },
  shikkui_out:   { id: 'shikkui_out',   label: '外壁漆喰',      color: '#e6e1d5', roughness: 0.95, phrase: 'white shikkui plaster exterior wall' },
  yakisugi:      { id: 'yakisugi',      label: '焼杉',          color: '#2e2a26', roughness: 0.86, phrase: 'charred cedar boards (yakisugi), matte black' },
  roof_kawara:   { id: 'roof_kawara',   label: '瓦',            color: '#3f4550', roughness: 0.72, phrase: 'aged Japanese clay roof tiles (kawara)' },
  roof_metal:    { id: 'roof_metal',    label: 'ガルバリウム',   color: '#5a5f63', roughness: 0.42, phrase: 'standing-seam galvalume steel roofing' },
  roof_shingle:  { id: 'roof_shingle',  label: 'スレート',      color: '#4c4a48', roughness: 0.8,  phrase: 'weathered slate roof shingles' },
  /** 手つかずの既存部分 */
  as_is_floor:   { id: 'as_is_floor',   label: '既存の床',      color: '#9c8a72', roughness: 0.85, phrase: 'aged timber floor' },
};

export type WaterUnit = 'kitchen' | 'toilet' | 'bath' | 'sink';

export interface RoomScene {
  roomId: string;
  name: string;
  areaM2: number;
  /** 部屋の外周（mm, 図面座標） */
  outline: XY[];
  floor: Finish;
  wall: Finish;
  ceiling: Finish;
  waterUnits: WaterUnit[];
  /** 追加した照明の数 */
  lights: number;
}

export interface CameraSpec {
  id: string;
  label: string;
  /** three.js 座標(m)。y が高さ */
  position: [number, number, number];
  target: [number, number, number];
  fovDeg: number;
}

export interface RenovationScene {
  /** ops 適用後のモデル */
  model: SpaceModel;
  rooms: RoomScene[];
  cameras: CameraSpec[];
  /** 撤去された壁の数など、言葉で伝えたい変化 */
  changes: string[];
}

const DEFAULT_FLOOR = FINISHES['as_is_floor']!;
const DEFAULT_WALL = FINISHES['paint']!;
const DEFAULT_CEILING = FINISHES['ceiling_paint']!;

/** 部屋名から、既定の床仕上げを推測する（土間・和室は見た目が大きく違う） */
function guessFloor(name: string): Finish {
  if (name.includes('土間')) return FINISHES['doma']!;
  if (name.includes('和室') || name.includes('座敷')) return FINISHES['tatami_omote']!;
  return DEFAULT_FLOOR;
}

/** 改修案(ops)を適用した3Dシーンの材料表をつくる */
export function buildRenovationScene(
  model: SpaceModel,
  ops: RenovationOp[],
  levelIndex = 0,
): RenovationScene {
  const next = applyOps(model, ops, levelIndex);
  const level = next.levels[Math.min(levelIndex, next.levels.length - 1)];
  const changes: string[] = [];
  if (!level) return { model: next, rooms: [], cameras: [], changes };

  const rooms = detectRooms(level);
  const faces = detectFaces(level);
  const nodeById = new Map(level.nodes.map((n) => [n.id, n] as const));

  const byRoom = new Map<string, RoomScene>();
  rooms.forEach((r: Room, i) => {
    const f = faces[i];
    const outline: XY[] = f ? f.nodeIds.map((id) => nodeById.get(id)!).filter(Boolean) : [];
    byRoom.set(r.id, {
      roomId: r.id,
      name: r.name,
      areaM2: r.areaM2,
      outline,
      floor: guessFloor(r.name),
      wall: DEFAULT_WALL,
      ceiling: DEFAULT_CEILING,
      waterUnits: [],
      lights: 0,
    });
  });

  // opsの roomId は「改修前」のモデル基準。部屋idは壁を消すと振り直されるため、
  // まず名前で突き合わせる（idで引くと別の部屋に当たってしまう）
  const beforeRooms = detectRooms(model.levels[Math.min(levelIndex, model.levels.length - 1)]!);
  const idToName = new Map(beforeRooms.map((r) => [r.id, r.name] as const));
  const findScene = (roomId: string): RoomScene | undefined => {
    const name = idToName.get(roomId);
    if (name) {
      const byName = [...byRoom.values()].find((s) => s.name === name);
      if (byName) return byName;
    }
    // 名前が見つからない（部屋が統合された等）ときだけ id で引く
    return byRoom.get(roomId);
  };

  let removed = 0;
  for (const op of ops) {
    switch (op.op) {
      case 'remove_partition':
        removed += 1;
        break;
      case 'change_floor': {
        const s = findScene(op.roomId);
        const fin = FINISHES[op.finishId];
        if (s && fin) {
          s.floor = fin;
          changes.push(`${s.name}の床を${fin.label}に`);
        }
        break;
      }
      case 'change_wall_finish': {
        const s = findScene(op.roomId);
        const fin = FINISHES[op.finishId];
        if (s && fin) {
          s.wall = fin;
          changes.push(`${s.name}の壁を${fin.label}に`);
        }
        break;
      }
      case 'change_ceiling': {
        const s = findScene(op.roomId);
        const fin = FINISHES[op.finishId];
        if (s && fin) {
          s.ceiling = fin;
          changes.push(`${s.name}の天井を${fin.label}に`);
        }
        break;
      }
      case 'add_water_unit': {
        const s = findScene(op.roomId);
        if (s) {
          s.waterUnits.push(op.unit);
          const jp = { kitchen: 'キッチン', toilet: 'トイレ', bath: '浴室', sink: '洗面' }[op.unit];
          changes.push(`${s.name}に${jp}を新設`);
        }
        break;
      }
      case 'electrical': {
        if (op.work === 'lighting_diy') {
          const s = op.roomId ? findScene(op.roomId) : [...byRoom.values()][0];
          if (s) s.lights += op.count;
          changes.push(`照明を${op.count}箇所`);
        }
        break;
      }
      case 'insulate':
        if (op.target === 'window_inner') changes.push('内窓を設置');
        break;
      default:
        break;
    }
  }
  if (removed > 0) changes.unshift(`間仕切りを${removed}枚撤去して一室に`);

  return {
    model: next,
    rooms: [...byRoom.values()],
    cameras: [
      ...interiorCameras(next, 3, levelIndex),
      // 屋根があるときだけ、外からの視点を足す（屋根が無いと箱にしか見えない）
      ...(next.roof ? [exteriorCamera(next)].filter((c): c is CameraSpec => c !== null) : []),
    ],
    changes,
  };
}

/* ────────── 視点さがし ──────────
 * 「どこに立てば、その部屋がいちばんよく見えるか」を実際に数えて決める。
 * 部屋の中に格子状の点をまいて、立ち位置ごとに“見える点の数”を測り、
 * いちばん多く見える向きを採る。L字の部屋でも壁の陰は見えない点として落ちる。
 */

/** 部屋の中に等間隔の点をまく */
function interiorSamples(pts: XY[], stepMm: number, cap: number): XY[] {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  let step = stepMm;
  for (let guard = 0; guard < 6; guard++) {
    const out: XY[] = [];
    for (let x = x0 + step / 2; x < x1; x += step) {
      for (let y = y0 + step / 2; y < y1; y += step) {
        const p = { x, y };
        if (pointInPolygon(p, pts)) out.push(p);
      }
    }
    if (out.length <= cap || step > 4000) return out;
    step *= 1.45;
  }
  return [];
}

/** 2点を結ぶ線が部屋の中に収まっているか（壁の陰を落とすための粗い判定） */
function seesEachOther(a: XY, b: XY, pts: XY[]): boolean {
  for (const t of [0.2, 0.4, 0.6, 0.8]) {
    if (!pointInPolygon({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, pts)) return false;
  }
  return true;
}

/**
 * 室内の見せ場からのカメラを提案する。
 *
 * 目線は水平のまま（垂直線が倒れない）。画角は見る先までの距離に合わせる。
 * 窓が画面に入る向きを優先し、光の見える構図にする。
 */
export function interiorCameras(model: SpaceModel, max = 3, levelIndex = 0): CameraSpec[] {
  const level = model.levels[Math.min(levelIndex, model.levels.length - 1)];
  if (!level) return [];
  const rooms = detectRooms(level);
  const faces = detectFaces(level);
  const nodeById = new Map(level.nodes.map((n) => [n.id, n] as const));
  const EYE = 1.45 + levelBaseY(model, levelIndex);
  const MIN_CLEARANCE = 520;
  const HALF_FOV = Math.cos((33 * Math.PI) / 180); // 探索に使う水平画角の半分
  const out: CameraSpec[] = [];

  const bestOpening = (wallLoop: string[]): { p: XY; kind: string; width: number } | null => {
    let best: { p: XY; kind: string; width: number; score: number } | null = null;
    for (const wallId of wallLoop) {
      const w = level.walls.find((x) => x.id === wallId);
      if (!w) continue;
      const a = nodeById.get(w.a);
      const b = nodeById.get(w.b);
      if (!a || !b) continue;
      const len = dist(a, b);
      if (len < 1) continue;
      for (const o of level.openings.filter((x) => x.wallId === wallId)) {
        const score = (o.kind === 'window' ? 1e6 : o.kind === 'entrance' ? 5e5 : 0) + o.width;
        if (best && score <= best.score) continue;
        const t = (o.offset + o.width / 2) / len;
        best = {
          p: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t },
          kind: o.kind,
          width: o.width,
          score,
        };
      }
    }
    return best;
  };

  const ordered = rooms
    .map((r, i) => ({ r, f: faces[i] }))
    .filter((x) => x.f)
    .sort((a, b) => b.r.areaM2 - a.r.areaM2);

  // 「部屋1」のような仮の名前しか無いときは、その部屋の性格で呼ぶ
  const generic = /^部屋\d+$/;
  const labelFor = (r: Room, hasEntrance: boolean, windows: number, index: number): string => {
    if (!generic.test(r.name)) return `${r.name}から`;
    if (hasEntrance) return '入ってすぐから';
    if (windows >= 2) return '光の入る部屋から';
    if (windows === 0) return '窓のない部屋から';
    return `${r.tatami}畳ほどの部屋から`;
  };

  for (const { r, f } of ordered) {
    if (out.length >= max) break;
    const pts: XY[] = f!.nodeIds.map((id) => nodeById.get(id)!).filter(Boolean);
    if (pts.length < 3 || r.areaM2 < 3) continue;

    const samples = interiorSamples(pts, Math.max(380, Math.sqrt(r.areaM2) * 190), 320);
    if (samples.length < 6) continue;

    // 立てる場所（壁から離れている点）を間引いて候補にする
    const standable = samples.filter((p) => distToEdges(p, pts) >= MIN_CLEARANCE);
    const pool = standable.length ? standable : [poleOfInaccessibility(pts)];
    const stride = Math.max(1, Math.ceil(pool.length / 40));
    const stands = pool.filter((_, i) => i % stride === 0);

    const win = bestOpening(r.wallLoop);
    const DIRS = 24;

    let best: { stand: XY; look: XY; seen: number; far: number } | null = null;
    for (const stand of stands) {
      const vis = samples.filter((s) => s !== stand && seesEachOther(stand, s, pts));
      if (!vis.length) continue;
      const winVisible = win ? seesEachOther(stand, win.p, pts) : false;
      for (let d = 0; d < DIRS; d++) {
        const ang = (d / DIRS) * Math.PI * 2;
        const ux = Math.cos(ang);
        const uy = Math.sin(ang);
        let seen = 0;
        let sx = 0;
        let sy = 0;
        let far = 0;
        for (const s of vis) {
          const vx = s.x - stand.x;
          const vy = s.y - stand.y;
          const len = Math.hypot(vx, vy);
          if (len < 1) continue;
          if ((vx * ux + vy * uy) / len < HALF_FOV) continue;
          seen++;
          sx += s.x;
          sy += s.y;
          if (len > far) far = len;
        }
        if (seen < 3) continue;
        let score = seen;
        if (winVisible && win) {
          const wx = win.p.x - stand.x;
          const wy = win.p.y - stand.y;
          const wl = Math.hypot(wx, wy) || 1;
          const cos = (wx * ux + wy * uy) / wl;
          // 窓が画面に入るほど良い。真横・後ろは減点しない程度に留める
          if (cos >= HALF_FOV) score += samples.length * 0.42;
          else if (cos > 0.2) score += samples.length * 0.12;
        }
        // 立ち位置が壁に近いほど、部屋が前に広がる
        score += (1 - Math.min(1, distToEdges(stand, pts) / 2600)) * samples.length * 0.16;
        if (!best || score > best.seen) {
          best = { stand, look: { x: sx / seen, y: sy / seen }, seen: score, far };
        }
      }
    }

    const stand = best?.stand ?? poleOfInaccessibility(pts);
    const look = best?.look ?? (win ? win.p : pts[0]!);
    // 画角は「いちばん奥まで入るか」で決める。近くの重心だけだと広角になりすぎる
    const depth = Math.max(1.2, ((best?.far ?? dist(stand, look)) * 0.7 + dist(stand, look) * 0.3) / 1000);
    const fovDeg = Math.max(42, Math.min(64, 78 - depth * 6.2));

    const winCount = r.wallLoop.reduce(
      (n, wid) => n + level.openings.filter((o) => o.wallId === wid && o.kind === 'window').length,
      0,
    );
    const entrance = r.wallLoop.some((wid) =>
      level.openings.some((o) => o.wallId === wid && o.kind === 'entrance'),
    );
    out.push({
      id: 'cam-' + r.id,
      label: labelFor(r, entrance, winCount, out.length),
      position: [stand.x / 1000, EYE, stand.y / 1000],
      target: [look.x / 1000, EYE, look.y / 1000],
      fovDeg,
    });
  }
  return out;
}

/**
 * 外から建物を見る視点。
 *
 * 玄関のある面の外に立つ。人が最初にその家を見る位置だから。
 * 屋根の形と軒の深さは、ここからでないと伝わらない。
 */
export function exteriorCamera(model: SpaceModel): CameraSpec | null {
  const nodes = model.levels.flatMap((lv) => lv.nodes);
  if (nodes.length < 3) return null;
  const xs = nodes.map((n) => n.x / 1000);
  const ys = nodes.map((n) => n.y / 1000);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...ys);
  const maxZ = Math.max(...ys);
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const w = maxX - minX;
  const d = maxZ - minZ;
  const diag = Math.hypot(w, d);

  // 玄関のある壁を探し、その外側に立つ
  let dir = { x: 0, y: 1 };
  outer: for (const lv of model.levels) {
    const byId = new Map(lv.nodes.map((n) => [n.id, n] as const));
    for (const o of lv.openings) {
      if (o.kind !== 'entrance') continue;
      const wl = lv.walls.find((x) => x.id === o.wallId);
      const a = wl && byId.get(wl.a);
      const b = wl && byId.get(wl.b);
      if (!a || !b) continue;
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      const nx = -Math.sin(ang);
      const ny = Math.cos(ang);
      // 建物の中心から離れる向きを外とする
      const mx = (a.x + b.x) / 2000 - cx;
      const mz = (a.y + b.y) / 2000 - cz;
      const sign = nx * mx + ny * mz >= 0 ? 1 : -1;
      dir = { x: nx * sign, y: ny * sign };
      break outer;
    }
  }

  // 建物の高さ。階を積み、屋根の棟まで見込む
  const wallTop = model.levels.reduce((y, lv) => y + (lv.heightMm ?? 2400) / 1000 + 0.32, 0) - 0.32;
  const r = model.roof;
  const rise = r
    ? r.shape === 'flat'
      ? 0.45
      : (Math.min(w, d) / 2 + (r.eaveMm ?? 600) / 1000) * (Math.max(0, r.pitchSun) / 10) + 0.3
    : 0.4;
  const topY = wallTop + rise;

  const EYE = 1.55;
  const fovDeg = Math.max(32, Math.min(50, 58 - diag * 0.9));
  const tanHalf = Math.tan((fovDeg * Math.PI) / 360);

  // あおらずに（垂直線を倒さずに）棟まで入れるため、レンズを上へずらす。
  // 画面側の CameraRig と同じ値を使う。ずらすと上に見える範囲が (1 + K*s) 倍になる
  const LENS_K = 0.32;
  const LENS_SHIFT = 0.55;
  const upFactor = 1 + LENS_K * LENS_SHIFT;

  const needForHeight = (topY - EYE) / Math.max(0.15, tanHalf * upFactor);
  // 横は 4:3 を見込む
  const needForWidth = diag / 2 / Math.max(0.15, tanHalf * 1.33);
  // 建物の手前の面までの距離が要るので、外接円の半径を足す
  const away = Math.max(8, diag / 2 + Math.max(needForHeight, needForWidth) * 1.12);

  return {
    id: 'cam-exterior',
    label: '外から',
    position: [cx + dir.x * away, EYE, cz + dir.y * away],
    // 目線は水平。垂直線が倒れない（あおらない）
    target: [cx, EYE, cz],
    fovDeg,
  };
}
