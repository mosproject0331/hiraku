import { detectFaces, detectRooms, dist, polygonCentroid, type SpaceModel, type XY } from '@hiraku/core';

/**
 * 建物を「読む」。
 *
 * 提案を組む前に、この家がどういう家なのかを図面から取り出す。
 * どこから入るか、どこに光が入るか、どこが奥まっているか。
 * 建築の判断はここから始まるので、案の質はこの読み取りの質で決まる。
 */

export interface RoomFact {
  id: string;
  name: string;
  areaM2: number;
  tatami: number;
  centre: XY;
  /** 外に面した窓の数と、その面積(㎡) */
  windows: number;
  windowAreaM2: number;
  /** 玄関がこの部屋に付いているか */
  hasEntrance: boolean;
  /** 外に面している壁の数 */
  exteriorWalls: number;
  /** 壁を共有している部屋 */
  neighbours: string[];
  isDoma: boolean;
  isWashitsu: boolean;
  /** 玄関から数えていくつ部屋を通るか。奥まり具合 */
  depthFromEntry: number;
}

export interface InnerWall {
  id: string;
  between: [string, string];
  lengthMm: number;
  /** 耐力壁の疑いがあると、抜く提案はしない */
  removable: boolean;
}

export interface BuildingFacts {
  rooms: RoomFact[];
  totalAreaM2: number;
  /** 入ってすぐの部屋 */
  entryRoomId?: string;
  /** いちばん人を迎えるのに向く部屋。光と入りやすさで決める */
  frontRoomId?: string;
  /** いちばん奥まった部屋。こもる用途に向く */
  quietRoomId?: string;
  /** 水回りを足すならここ。外に面していて、表からも遠すぎない */
  wetRoomId?: string;
  biggestRoomId?: string;
  innerWalls: InnerWall[];
  /** 窓がまったく無い部屋 */
  darkRoomIds: string[];
}

export function readBuilding(model: SpaceModel): BuildingFacts {
  const level = model.levels[0];
  if (!level) return { rooms: [], totalAreaM2: 0, innerWalls: [], darkRoomIds: [] };

  const rooms = detectRooms(level);
  const faces = detectFaces(level);
  const nodeById = new Map(level.nodes.map((n) => [n.id, n] as const));
  const wallById = new Map(level.walls.map((w) => [w.id, w] as const));

  // 壁がいくつの部屋に使われているか。1つなら外壁
  const wallUse = new Map<string, string[]>();
  rooms.forEach((r) => {
    for (const wid of r.wallLoop) {
      const list = wallUse.get(wid);
      if (list) list.push(r.id);
      else wallUse.set(wid, [r.id]);
    }
  });

  const openingsByWall = new Map<string, typeof level.openings>();
  for (const o of level.openings) {
    const list = openingsByWall.get(o.wallId);
    if (list) list.push(o);
    else openingsByWall.set(o.wallId, [o]);
  }

  const facts: RoomFact[] = rooms.map((r, i) => {
    const f = faces[i];
    const pts: XY[] = f ? f.nodeIds.map((id) => nodeById.get(id)!).filter(Boolean) : [];
    let windows = 0;
    let windowAreaM2 = 0;
    let hasEntrance = false;
    let exteriorWalls = 0;
    const neighbours = new Set<string>();

    for (const wid of r.wallLoop) {
      const users = wallUse.get(wid) ?? [];
      if (users.length <= 1) exteriorWalls += 1;
      for (const other of users) if (other !== r.id) neighbours.add(other);
      for (const o of openingsByWall.get(wid) ?? []) {
        if (o.kind === 'entrance') hasEntrance = true;
        // 外壁にある窓だけが採光になる
        if (o.kind === 'window' && users.length <= 1) {
          windows += 1;
          windowAreaM2 += (o.width * o.height) / 1e6;
        }
      }
    }

    return {
      id: r.id,
      name: r.name,
      areaM2: r.areaM2,
      tatami: r.tatami,
      centre: pts.length >= 3 ? polygonCentroid(pts) : { x: 0, y: 0 },
      windows,
      windowAreaM2: Math.round(windowAreaM2 * 100) / 100,
      hasEntrance,
      exteriorWalls,
      neighbours: [...neighbours],
      isDoma: r.name.includes('土間'),
      isWashitsu: r.name.includes('和室') || r.name.includes('座敷'),
      depthFromEntry: 0,
    };
  });

  const byId = new Map(facts.map((f) => [f.id, f] as const));

  // 玄関からの奥まり具合を、部屋づたいに数える
  const entry = facts.find((f) => f.hasEntrance) ?? facts[0];
  if (entry) {
    for (const f of facts) f.depthFromEntry = Infinity;
    entry.depthFromEntry = 0;
    const queue = [entry.id];
    while (queue.length) {
      const cur = byId.get(queue.shift()!)!;
      for (const n of cur.neighbours) {
        const nf = byId.get(n);
        if (nf && nf.depthFromEntry > cur.depthFromEntry + 1) {
          nf.depthFromEntry = cur.depthFromEntry + 1;
          queue.push(n);
        }
      }
    }
    for (const f of facts) if (!Number.isFinite(f.depthFromEntry)) f.depthFromEntry = 9;
  }

  const innerWalls: InnerWall[] = [];
  for (const [wid, users] of wallUse) {
    if (users.length !== 2) continue;
    const w = wallById.get(wid);
    if (!w) continue;
    const a = nodeById.get(w.a);
    const b = nodeById.get(w.b);
    innerWalls.push({
      id: wid,
      between: [users[0]!, users[1]!],
      lengthMm: a && b ? Math.round(dist(a, b)) : 0,
      removable: w.structural !== 'suspected',
    });
  }

  const sorted = [...facts].sort((p, q) => q.areaM2 - p.areaM2);
  const biggest = sorted[0];

  // 迎える部屋: 玄関のそば（0〜1部屋ぶん）で、いちばん光が入るところ
  const near = facts.filter((f) => f.depthFromEntry <= 1 && f.areaM2 >= 6);
  const front =
    [...(near.length ? near : facts)].sort(
      (p, q) => q.windowAreaM2 - p.windowAreaM2 || q.areaM2 - p.areaM2,
    )[0] ?? biggest;

  const quiet = [...facts].sort(
    (p, q) => q.depthFromEntry - p.depthFromEntry || p.windowAreaM2 - q.windowAreaM2,
  )[0];

  // 水回り: 外に面していて（排水を出せる）、表から遠すぎない小さめの部屋
  const wet =
    [...facts]
      .filter((f) => f.exteriorWalls >= 1 && f.areaM2 >= 3 && f.id !== front?.id)
      .sort(
        (p, q) =>
          p.depthFromEntry - q.depthFromEntry ||
          q.exteriorWalls - p.exteriorWalls ||
          p.areaM2 - q.areaM2,
      )[0] ?? biggest;

  return {
    rooms: facts,
    totalAreaM2: Math.round(facts.reduce((s, f) => s + f.areaM2, 0) * 10) / 10,
    entryRoomId: entry?.id,
    frontRoomId: front?.id,
    quietRoomId: quiet?.id,
    wetRoomId: wet?.id,
    biggestRoomId: biggest?.id,
    innerWalls,
    darkRoomIds: facts.filter((f) => f.windows === 0).map((f) => f.id),
  };
}

/** 2つの部屋のあいだにある、抜ける壁 */
export function wallBetween(b: BuildingFacts, a: string, c: string): InnerWall | undefined {
  return b.innerWalls.find(
    (w) => w.removable && ((w.between[0] === a && w.between[1] === c) || (w.between[0] === c && w.between[1] === a)),
  );
}
