import type { Level, NameHint, Room } from './types';
import { pointInPolygon, polygonCentroid, signedAreaMm2, type XY } from './geometry';

export interface Face {
  nodeIds: string[];
  wallIds: string[];
  signedArea: number;
}

interface HalfEdge {
  from: string;
  to: string;
  wallId: string;
}

const MIN_ROOM_MM2 = 1e4; // 0.01 m^2 未満は縮退面として無視

/**
 * 壁グラフから閉ループを抽出して部屋を認識する。
 * 各有向エッジを一度ずつ「最も時計回りの分岐を選ぶ」規則で辿ると平面グラフの全ての面が得られる。
 * 最大|面積|の面が外周面なのでそれを除外する(部屋が1つの場合は同型の2面から片方を残す)。
 */
export function detectFaces(level: Level): Face[] {
  const nodeById = new Map(level.nodes.map((n) => [n.id, n] as const));
  const out = new Map<string, HalfEdge[]>();
  for (const w of level.walls) {
    if (w.a === w.b) continue;
    if (!nodeById.has(w.a) || !nodeById.has(w.b)) continue;
    if (!out.has(w.a)) out.set(w.a, []);
    if (!out.has(w.b)) out.set(w.b, []);
    out.get(w.a)!.push({ from: w.a, to: w.b, wallId: w.id });
    out.get(w.b)!.push({ from: w.b, to: w.a, wallId: w.id });
  }
  const angleOf = (from: string, to: string): number => {
    const a = nodeById.get(from)!;
    const b = nodeById.get(to)!;
    return Math.atan2(b.y - a.y, b.x - a.x);
  };
  for (const [from, list] of out) {
    list.sort((p, q) => angleOf(from, p.to) - angleOf(from, q.to));
  }

  const visited = new Set<string>();
  const faces: { nodeIds: string[]; wallIds: string[]; signedArea: number }[] = [];

  for (const list of out.values()) {
    for (const start of list) {
      if (visited.has(start.from + '|' + start.to)) continue;
      const nodeIds: string[] = [];
      const wallIds: string[] = [];
      let cur = start;
      let guard = 0;
      while (guard++ < 100000) {
        visited.add(cur.from + '|' + cur.to);
        nodeIds.push(cur.from);
        wallIds.push(cur.wallId);
        const nbrs = out.get(cur.to)!;
        const back = angleOf(cur.to, cur.from);
        // back の角度より「すぐ小さい」角度のエッジ = 最も時計回りの分岐
        let next: HalfEdge | undefined;
        for (let i = nbrs.length - 1; i >= 0; i--) {
          const cand = nbrs[i]!;
          if (angleOf(cur.to, cand.to) < back - 1e-9) {
            next = cand;
            break;
          }
        }
        if (!next) next = nbrs[nbrs.length - 1]!;
        cur = next;
        if (cur.from === start.from && cur.to === start.to) break;
      }
      const pts: XY[] = nodeIds.map((id) => nodeById.get(id)!);
      faces.push({ nodeIds, wallIds, signedArea: signedAreaMm2(pts) });
    }
  }

  const candidates = faces
    .filter((f) => Math.abs(f.signedArea) > MIN_ROOM_MM2)
    .sort((a, b) => Math.abs(b.signedArea) - Math.abs(a.signedArea));
  return candidates.slice(1); // 先頭 = 外周面
}

/** detectFaces の面と同順で Room を生成する */
export function detectRooms(level: Level, nameHints?: NameHint[]): Room[] {
  const nodeById = new Map(level.nodes.map((n) => [n.id, n] as const));
  const rooms: Room[] = detectFaces(level).map((f, i) => {
      const pts: XY[] = f.nodeIds.map((id) => nodeById.get(id)!);
      const areaM2 = Math.round(Math.abs(f.signedArea) / 1e6 * 100) / 100;
      const tatami = Math.round((Math.abs(f.signedArea) / 1e6 / 1.62) * 10) / 10;
      const hints = nameHints ?? level.nameHints ?? [];
      const hint = hints.find((h) => pointInPolygon({ x: h.x, y: h.y }, pts));
      return {
        id: 'room-' + (i + 1),
        name: hint?.name ?? '部屋' + (i + 1),
        wallLoop: f.wallIds,
        areaM2,
        tatami,
      };
    });
  return rooms;
}

/** 面積・畳数を再計算してlevelに反映した新しいLevelを返す(イミュータブル) */
export function withDetectedRooms(level: Level, nameHints?: NameHint[]): Level {
  return { ...level, rooms: detectRooms(level, nameHints) };
}

/**
 * face番目の部屋に名前を付ける。部屋は検出のたび再生成されるため、
 * 名前は部屋の重心を指す位置ヒント(nameHints)として保持する。
 */
export function setRoomName(level: Level, faceIndex: number, name: string): Level {
  const faces = detectFaces(level);
  const face = faces[faceIndex];
  if (!face) return level;
  const nodeById = new Map(level.nodes.map((n) => [n.id, n] as const));
  const pts: XY[] = face.nodeIds.map((id) => nodeById.get(id)!).filter(Boolean);
  const c = polygonCentroid(pts);
  const hints = (level.nameHints ?? []).filter((h) => !pointInPolygon({ x: h.x, y: h.y }, pts));
  return { ...level, nameHints: [...hints, { x: c.x, y: c.y, name }] };
}
