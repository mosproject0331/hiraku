import { dist, pointInPolygon, type XY } from './geometry';
import { detectFaces, outerBoundary } from './rooms';
import type { Confidence, Level, Roof, SpaceModel } from './types';

/**
 * 軸組（骨組み）。
 *
 * ここが出す寸法は「よくある納まり」であって、構造計算の結果ではない。
 * 目的は二つ。
 *   1. 現場で何を見に行けばいいかが分かること（床下を覗く、天井裏を見る）
 *   2. 直すときに何本・何m3 要るかが拾えること
 *
 * だから全ての部材は estimated から始まり、実際に見て確かめた分だけ measured に上がる。
 * 「この壁は抜けます」とは決して言わない。「この壁の上には何が載っている見込みか」までを言う。
 */

export type MemberKind =
  | 'dodai' | 'toshibashira' | 'kudabashira' | 'mabashira'
  | 'keta' | 'doubuchi' | 'hari'
  | 'oobiki' | 'yukazuka' | 'neda'
  | 'munagi' | 'moya' | 'taruki' | 'koyazuka' | 'koyabari'
  | 'sujikai' | 'hiuchi'
  | 'magusa' | 'madodai' | 'nobuchi' | 'nobuchiuke' | 'nuki';

export const MEMBER_LABEL: Record<MemberKind, string> = {
  dodai: '土台',
  toshibashira: '通し柱',
  kudabashira: '管柱',
  mabashira: '間柱',
  keta: '桁',
  doubuchi: '胴差',
  hari: '梁',
  oobiki: '大引',
  yukazuka: '床束',
  neda: '根太',
  munagi: '棟木',
  moya: '母屋',
  taruki: '垂木',
  koyazuka: '小屋束',
  koyabari: '小屋梁',
  sujikai: '筋かい',
  hiuchi: '火打',
  magusa: 'まぐさ',
  madodai: '窓台',
  nobuchi: '野縁',
  nobuchiuke: '野縁受け',
  nuki: '貫',
};

/** その部材が建物の何を持っているか。抜いていいかの話をするときの前提になる */
export const MEMBER_ROLE: Record<MemberKind, string> = {
  dodai: '建物の重さを基礎に渡す',
  toshibashira: '1階から2階まで通して立ち、建物の角を固める',
  kudabashira: 'その階の重さを下に渡す',
  mabashira: '壁の下地を留めるためのもので、重さは持たない',
  keta: '屋根や上階の重さを受けて柱に渡す',
  doubuchi: '2階の床と外周を受ける',
  hari: '床や屋根の重さを、柱と柱のあいだで受け渡す',
  oobiki: '1階の床を下から受ける',
  yukazuka: '大引を地面から支える',
  neda: '床板を受ける',
  munagi: '屋根のいちばん上で垂木を受ける',
  moya: '垂木を途中で受ける',
  taruki: '屋根の面をつくり、野地板を受ける',
  koyazuka: '母屋を小屋梁から立ち上げて支える',
  koyabari: '屋根の重さを受けて桁に渡す',
  sujikai: '地震や風で建物がゆがむのを止める',
  hiuchi: '床や小屋の四隅を固めて、水平にゆがむのを止める',
  magusa: '開口の上をまたいで、上からの重さを両脇の柱に逃がす',
  madodai: '窓の下枠を受ける',
  nobuchi: '天井板を留める',
  nobuchiuke: '野縁を吊って受ける',
  nuki: '柱を横につないで、土壁の下地にもなる',
};

export type Species = 'sugi' | 'hinoki' | 'matsu' | 'beimatsu' | 'unknown';

export const SPECIES_LABEL: Record<Species, string> = {
  sugi: 'スギ',
  hinoki: 'ヒノキ',
  matsu: 'マツ',
  beimatsu: 'ベイマツ',
  unknown: '不明',
};

export interface Section {
  /** 幅 mm */
  w: number;
  /** せい（高さ）mm */
  h: number;
}

export interface P3 {
  x: number;
  y: number;
  /** その階の床仕上げ面を 0 とした高さ(mm)。下は負 */
  z: number;
}

/** 現場で見て確かめた記録 */
export interface MemberFound {
  /** 実測した断面 */
  section?: Section;
  species?: Species;
  /** 見た状態 */
  state?: 'ok' | 'watch' | 'bad';
  memo?: string;
  /** いつ見たか */
  at?: string;
}

export interface Member {
  id: string;
  kind: MemberKind;
  section: Section;
  a: P3;
  b: P3;
  species: Species;
  confidence: Confidence;
  /** なぜここにこれがあると考えたか。画面に出す */
  because: string;
  /** どこを見れば確かめられるか */
  howToCheck: string;
  wallId?: string;
  roomId?: string;
  found?: MemberFound;
}

export interface Frame {
  levelId: string;
  members: Member[];
  /** 組み立てに使った前提。画面に出して、違えば直してもらう */
  assumptions: string[];
  /** 表の範囲を超えたなど、機械では決められなかったこと */
  outOfRange: string[];
}

/** 断面の長さ。三次元 */
function len3(m: Member): number {
  const dx = m.b.x - m.a.x;
  const dy = m.b.y - m.a.y;
  const dz = m.b.z - m.a.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/** 製材の規定寸法（針葉樹の構造用製材のJAS）。せいはこの梯子に乗る */
const DEPTH_LADDER = [105, 120, 135, 150, 180, 210, 240, 270, 300, 330, 360, 390];

function snapDepth(mm: number): number {
  for (const d of DEPTH_LADDER) if (d >= mm) return d;
  return DEPTH_LADDER[DEPTH_LADDER.length - 1]!;
}

/**
 * 梁せいの見当。
 *
 * 出典: 北海道立林産試験場『木造建築のためのスパン表 - 製材及び構造用集成材の構造設計 -』
 * 表A 2階床ばり断面表より、すぎ・甲種1級・幅105mm・変形重視しない の行。
 * 荷重条件は事務室（住宅より重い側）なので、住宅用途では余裕がある向きに出る。
 *
 * 縦がスパン、横がはり間隔(負担幅)。表にない間は近い側に寄せる。
 */
const SUGI_105: { span: number; byTrib: [number, number][] }[] = [
  { span: 2730, byTrib: [[910, 120], [1820, 180], [2730, 180], [3640, 210]] },
  { span: 3640, byTrib: [[910, 180], [1820, 270], [2730, 270], [3640, 300]] },
  { span: 4550, byTrib: [[910, 240], [1820, 330], [2730, 330], [3640, 360]] },
  { span: 5460, byTrib: [[910, 270], [1820, 360], [2730, 390], [3640, 390]] },
  { span: 6370, byTrib: [[910, 330], [1820, 390], [2730, 390], [3640, 390]] },
];

export interface BeamGuess {
  section: Section;
  /** 表の範囲に収まったか */
  inTable: boolean;
  note: string;
}

/** スパンと負担幅から梁の見当をつける。表の外なら、そう言う */
export function beamGuess(spanMm: number, tribMm: number): BeamGuess {
  if (spanMm <= 1820) {
    return {
      section: { w: 105, h: 105 },
      inTable: true,
      note: 'スパンが1間以下なので、桁と同じ程度で足りることが多い',
    };
  }
  const row = SUGI_105.find((r) => r.span >= spanMm) ?? SUGI_105[SUGI_105.length - 1]!;
  const col = row.byTrib.find(([t]) => t >= tribMm) ?? row.byTrib[row.byTrib.length - 1]!;
  const over = spanMm > SUGI_105[SUGI_105.length - 1]!.span;
  return {
    section: { w: 105, h: snapDepth(col[1]) },
    inTable: !over,
    note: over
      ? `スパン${(spanMm / 1000).toFixed(2)}mは手元のスパン表の範囲(6.37m)を超えています。設計者に見てもらってください`
      : `スパン${(spanMm / 1000).toFixed(2)}m・負担幅${(tribMm / 1000).toFixed(2)}m のとき、スギ甲種1級 幅105mm で ${col[1]}mm`,
  };
}

// ── 床の組み方（床仕上げ面を0とした高さ mm）───────────────
const FLOOR_FINISH = -69;   // 仕上げ+下地合板のぶん
const NEDA_TOP = FLOOR_FINISH;
const NEDA_H = 105;
const NEDA_BOTTOM = NEDA_TOP - NEDA_H;
const OOBIKI_TOP = NEDA_BOTTOM;
const OOBIKI_H = 90;
const DODAI_H = 105;
const UNDER_FLOOR = 450;    // 床下の高さ。建築基準法の最低は330mm

interface Ctx {
  level: Level;
  li: number;
  model: SpaceModel;
  H: number;
  nodeById: Map<string, { x: number; y: number; confidence: Confidence }>;
  outer: XY[];
  isGround: boolean;
  hasAbove: boolean;
  out: Member[];
  assumptions: string[];
  outOfRange: string[];
  n: number;
}

function push(
  c: Ctx,
  kind: MemberKind,
  section: Section,
  a: P3,
  b: P3,
  species: Species,
  because: string,
  howToCheck: string,
  extra?: { wallId?: string; roomId?: string },
): void {
  c.n += 1;
  c.out.push({
    id: `${kind}-${c.n}`,
    kind,
    section,
    a,
    b,
    species,
    confidence: 'estimated',
    because,
    howToCheck,
    ...extra,
  });
}

/** 図面の外周に載っているか */
function onOuter(outer: XY[], p: XY, tolMm = 1): boolean {
  for (let i = 0; i < outer.length; i++) {
    const q = outer[i]!;
    if (Math.abs(q.x - p.x) <= tolMm && Math.abs(q.y - p.y) <= tolMm) return true;
  }
  return false;
}

/** 壁が外周のどれかの辺に重なるか（外壁判定の代わり） */
function wallOnOuter(outer: XY[], a: XY, b: XY): boolean {
  return onOuter(outer, a) && onOuter(outer, b);
}

// ── 軸組を組む ───────────────────────────────────────

export interface FrameOptions {
  /** 古い民家。柱が太く、土台がヒノキ、貫がある想定になる */
  minka?: boolean;
}

export function buildFrame(model: SpaceModel, levelIndex = 0, opt: FrameOptions = {}): Frame {
  const li = Math.min(Math.max(levelIndex, 0), model.levels.length - 1);
  const level = model.levels[li];
  if (!level) {
    return { levelId: '', members: [], assumptions: [], outOfRange: [] };
  }
  const H = level.heightMm || 2400;
  const nodeById = new Map(level.nodes.map((n) => [n.id, n]));
  const outer = outerBoundary(level);
  const c: Ctx = {
    level, li, model, H, nodeById, outer,
    isGround: li === 0,
    hasAbove: li < model.levels.length - 1,
    out: [], assumptions: [], outOfRange: [], n: 0,
  };

  const minka = opt.minka ?? false;
  c.assumptions.push(
    minka
      ? '古い民家として組んでいます。柱120mm角、土台はヒノキ、足元は玉石か布基礎'
      : '在来軸組として組んでいます。柱105mm角、通し柱120mm角',
  );
  c.assumptions.push(`階高 ${H}mm、床下 ${UNDER_FLOOR}mm で置いています`);

  sills(c, minka);
  posts(c, minka);
  studs(c);
  openingFrames(c);
  plates(c);
  beams(c);
  if (c.isGround) floorFrame(c);
  if (!c.isGround) c.assumptions.push('2階より上の床は、下の階の梁と胴差が受けています');
  if (li === model.levels.length - 1 && model.roof) roofFrame(c, model.roof);
  ceilingFrame(c);
  braces(c, minka);
  if (minka) nuki(c);

  return { levelId: level.id, members: c.out, assumptions: c.assumptions, outOfRange: c.outOfRange };
}

/** 土台。1階の壁の下を回る */
function sills(c: Ctx, minka: boolean): void {
  if (!c.isGround) return;
  const s = minka ? { w: 120, h: 120 } : { w: 105, h: DODAI_H };
  const top = OOBIKI_TOP;
  for (const w of c.level.walls) {
    const a = c.nodeById.get(w.a);
    const b = c.nodeById.get(w.b);
    if (!a || !b) continue;
    push(
      c, 'dodai', s,
      { x: a.x, y: a.y, z: top - s.h / 2 },
      { x: b.x, y: b.y, z: top - s.h / 2 },
      minka ? 'hinoki' : 'hinoki',
      '1階の壁の下には、基礎の上に土台が回っています',
      '床下点検口か畳を上げて、壁の真下を見る。腐りと蟻害はここに出ます',
      { wallId: w.id },
    );
  }
}

/** 柱。節点ごとに1本、長い壁には途中にも立てる */
function posts(c: Ctx, minka: boolean): void {
  const foot = c.isGround ? OOBIKI_TOP : 0;
  const kudaW = minka ? 120 : 105;
  const toshiW = minka ? 150 : 120;
  const placed = new Set<string>();

  const put = (x: number, y: number, through: boolean, why: string, wallId?: string) => {
    const key = `${Math.round(x)},${Math.round(y)}`;
    if (placed.has(key)) return;
    placed.add(key);
    const w = through ? toshiW : kudaW;
    push(
      c, through ? 'toshibashira' : 'kudabashira', { w, h: w },
      { x, y, z: foot }, { x, y, z: c.H },
      minka ? 'hinoki' : 'sugi',
      why,
      through
        ? '1階と2階で同じ位置に柱の面が出ているかを見る。通っていれば通し柱です'
        : '壁を叩くと詰まった音がします。柱の位置は壁の入隅・出隅と建具の脇',
      { wallId },
    );
  };

  // 節点＝壁の交わるところには必ず柱が立つ
  for (const n of c.level.nodes) {
    const deg = c.level.walls.filter((w) => w.a === n.id || w.b === n.id).length;
    if (deg === 0) continue;
    const through = c.hasAbove && onOuter(c.outer, n);
    put(
      n.x, n.y, through,
      through
        ? '外周の角で上の階があるので、通し柱の見込みです'
        : '壁が交わるところなので、柱が立っています',
    );
  }

  // 1間(1820mm)を超える壁には、途中にも管柱が要る
  for (const w of c.level.walls) {
    const a = c.nodeById.get(w.a);
    const b = c.nodeById.get(w.b);
    if (!a || !b) continue;
    const L = dist(a, b);
    const steps = Math.floor(L / 1820);
    if (steps < 1) continue;
    for (let i = 1; i <= steps; i++) {
      const t = (i * 1820) / L;
      if (t >= 0.98) break;
      put(
        a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, false,
        '1間(1820mm)ごとに柱が立つのが普通なので、その位置に置いています',
        w.id,
      );
    }
  }
}

/** 間柱。壁下地を留めるためのもの。重さは持たない */
function studs(c: Ctx): void {
  const foot = c.isGround ? OOBIKI_TOP : 0;
  for (const w of c.level.walls) {
    const a = c.nodeById.get(w.a);
    const b = c.nodeById.get(w.b);
    if (!a || !b) continue;
    const L = dist(a, b);
    const step = 455;
    const count = Math.floor(L / step);
    for (let i = 1; i <= count; i++) {
      const t = (i * step) / L;
      if (t >= 0.99) break;
      // 柱の位置(1820ごと)とかぶるところは飛ばす
      if (Math.abs(((i * step) % 1820)) < 1) continue;
      push(
        c, 'mabashira', { w: 30, h: 105 },
        { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: foot },
        { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: c.H },
        'sugi',
        '壁下地を留めるため、455mmごとに間柱が入っています',
        '壁を軽く叩くと455mmおきに詰まった音がします。下地探しでも見つかります',
        { wallId: w.id },
      );
    }
  }
}

/** 桁・胴差。壁の上を回る横架材 */
function plates(c: Ctx): void {
  for (const w of c.level.walls) {
    const a = c.nodeById.get(w.a);
    const b = c.nodeById.get(w.b);
    if (!a || !b) continue;
    const ext = wallOnOuter(c.outer, a, b);
    const kind: MemberKind = c.hasAbove && ext ? 'doubuchi' : 'keta';
    const s = kind === 'doubuchi' ? { w: 105, h: 240 } : { w: 105, h: 180 };
    push(
      c, kind, s,
      { x: a.x, y: a.y, z: c.H + s.h / 2 },
      { x: b.x, y: b.y, z: c.H + s.h / 2 },
      'beimatsu',
      kind === 'doubuchi'
        ? '外周で上に階があるので、2階の床を受ける胴差が回っています'
        : '壁の上を桁が回って、上からの重さを柱に渡しています',
      '天井裏の点検口から覗くと、壁の真上に太い材が見えます',
      { wallId: w.id },
    );
  }
}

/** 梁。部屋を渡す。ここがいちばんDIYに効く */
function beams(c: Ctx): void {
  const faces = detectFaces(c.level);
  for (let fi = 0; fi < faces.length; fi++) {
    const f = faces[fi]!;
    const pts = f.nodeIds.map((id) => c.nodeById.get(id)).filter(Boolean) as XY[];
    if (pts.length < 3) continue;
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs);
    const y0 = Math.min(...ys), y1 = Math.max(...ys);
    const wX = x1 - x0;
    const wY = y1 - y0;
    if (Math.max(wX, wY) < 1900) continue; // 1間そこそこなら桁で持つ

    // 短いほうを渡し、長いほうに沿って並べる
    const alongX = wX <= wY;
    const spanMm = alongX ? wX : wY;
    const runMm = alongX ? wY : wX;
    const gaps = Math.max(1, Math.round(runMm / 1820));
    const tribMm = runMm / gaps;
    const g = beamGuess(spanMm, tribMm);
    if (!g.inTable) c.outOfRange.push(g.note);

    for (let i = 1; i < gaps; i++) {
      const t = i / gaps;
      const a: P3 = alongX
        ? { x: x0, y: y0 + wY * t, z: c.H + g.section.h / 2 }
        : { x: x0 + wX * t, y: y0, z: c.H + g.section.h / 2 };
      const b: P3 = alongX
        ? { x: x1, y: y0 + wY * t, z: c.H + g.section.h / 2 }
        : { x: x0 + wX * t, y: y1, z: c.H + g.section.h / 2 };
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (!pointInPolygon(mid, pts)) continue;
      push(
        c, 'hari', g.section, a, b, 'sugi',
        `この部屋は${(spanMm / 1000).toFixed(2)}m渡すので、${(tribMm / 1000).toFixed(2)}mおきに梁が要ります。${g.note}`,
        '天井裏から見るか、天井を一部外して実際のせいを測る。ここは目視で確かめる価値があります',
        { roomId: c.level.rooms[fi]?.id },
      );
    }
  }
}

/** 床組。大引・床束・根太 */
function floorFrame(c: Ctx): void {
  const pts = c.outer;
  if (pts.length < 3) return;
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const y0 = Math.min(...ys), y1 = Math.max(...ys);
  const wX = x1 - x0, wY = y1 - y0;
  const alongX = wX <= wY; // 大引は短いほうを渡す
  const step = 910;

  const oobikiZ = OOBIKI_TOP - OOBIKI_H / 2;
  const runMm = alongX ? wY : wX;
  const count = Math.floor(runMm / step);
  for (let i = 1; i < count; i++) {
    const p = i * step;
    const a: P3 = alongX ? { x: x0, y: y0 + p, z: oobikiZ } : { x: x0 + p, y: y0, z: oobikiZ };
    const b: P3 = alongX ? { x: x1, y: y0 + p, z: oobikiZ } : { x: x0 + p, y: y1, z: oobikiZ };
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    if (!pointInPolygon(mid, pts)) continue;
    push(
      c, 'oobiki', { w: 90, h: OOBIKI_H }, a, b, 'hinoki',
      '1階の床は910mmごとの大引が下から受けています',
      '床下点検口から。たわむ床は、この大引か床束が効いていないことが多い',
    );

    // 床束は大引に沿って910mmごと
    const L = alongX ? wX : wY;
    const n = Math.floor(L / step);
    for (let j = 1; j < n; j++) {
      const q = j * step;
      const bx = alongX ? x0 + q : a.x;
      const by = alongX ? a.y : y0 + q;
      if (!pointInPolygon({ x: bx, y: by }, pts)) continue;
      push(
        c, 'yukazuka', { w: 90, h: 90 },
        { x: bx, y: by, z: OOBIKI_TOP - OOBIKI_H },
        { x: bx, y: by, z: OOBIKI_TOP - OOBIKI_H - UNDER_FLOOR },
        'hinoki',
        '大引を地面から支える床束です',
        '床下点検口から。浮いている束・沈んだ束がないかを見る。ここは自分で直せます',
      );
    }
  }

  // 根太は大引に直交して455mmごと
  const nedaZ = NEDA_TOP - NEDA_H / 2;
  const nedaRun = alongX ? wX : wY;
  const nc = Math.floor(nedaRun / 455);
  for (let i = 1; i < nc; i++) {
    const p = i * 455;
    const a: P3 = alongX ? { x: x0 + p, y: y0, z: nedaZ } : { x: x0, y: y0 + p, z: nedaZ };
    const b: P3 = alongX ? { x: x0 + p, y: y1, z: nedaZ } : { x: x1, y: y0 + p, z: nedaZ };
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    if (!pointInPolygon(mid, pts)) continue;
    push(
      c, 'neda', { w: 45, h: NEDA_H }, a, b, 'sugi',
      '床板を受ける根太です。455mmごとが標準（標準納まり図では@340〜@500）',
      '床下から見る。畳の下なら畳を1枚上げれば見えます',
    );
  }
  c.assumptions.push('床は根太あり（根太45×105@455・大引90角@910）で置いています。根太レスなら実際は違います');
}

/** 小屋組。棟木・母屋・垂木・小屋束 */
function roofFrame(c: Ctx, roof: Roof): void {
  const pts = c.outer;
  if (pts.length < 3) return;
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const y0 = Math.min(...ys), y1 = Math.max(...ys);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const pitch = roof.pitchSun / 10;
  const ridgeX = roof.ridge === 'x';
  const half = ridgeX ? (y1 - y0) / 2 : (x1 - x0) / 2;
  const base = c.H + 180;                 // 桁の上
  const ridgeZ = base + half * pitch;     // 棟の高さ
  const kawara = roof.material === 'kawara';

  // 棟木
  push(
    c, 'munagi', { w: 105, h: 105 },
    ridgeX ? { x: x0, y: cy, z: ridgeZ } : { x: cx, y: y0, z: ridgeZ },
    ridgeX ? { x: x1, y: cy, z: ridgeZ } : { x: cx, y: y1, z: ridgeZ },
    'sugi',
    `${roof.shape === 'gable' ? '切妻' : roof.shape === 'hip' ? '寄棟' : '片流れ'}の頂部を通る棟木です`,
    '天井裏か小屋裏に上がれば、いちばん高いところを通っています',
  );

  // 母屋は棟から軒に向かって910mmごと
  const steps = Math.max(1, Math.floor(half / 910));
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 1; i <= steps; i++) {
      const off = i * 910;
      if (off >= half) break;
      const z = ridgeZ - off * pitch;
      const a: P3 = ridgeX ? { x: x0, y: cy + side * off, z } : { x: cx + side * off, y: y0, z };
      const b: P3 = ridgeX ? { x: x1, y: cy + side * off, z } : { x: cx + side * off, y: y1, z };
      push(
        c, 'moya', { w: 90, h: 90 }, a, b, 'sugi',
        '垂木を途中で受ける母屋です。棟から910mmごとに入ります',
        '小屋裏から。垂木と直交して横に走っている材です',
      );
      // 小屋束は母屋を小屋梁から支える
      const L = ridgeX ? x1 - x0 : y1 - y0;
      const n = Math.max(1, Math.floor(L / 1820));
      for (let j = 0; j <= n; j++) {
        const t = j / n;
        const zx = ridgeX ? x0 + (x1 - x0) * t : a.x;
        const zy = ridgeX ? a.y : y0 + (y1 - y0) * t;
        push(
          c, 'koyazuka', { w: 90, h: 90 },
          { x: zx, y: zy, z }, { x: zx, y: zy, z: base + 240 },
          'sugi',
          '母屋を小屋梁の上から立ち上げて支える小屋束です',
          '小屋裏から。母屋の下に短く立っています',
        );
      }
    }
  }

  // 小屋梁。桁の上を渡って小屋束を受ける
  const barSpan = ridgeX ? x1 - x0 : y1 - y0;
  const barRun = ridgeX ? y1 - y0 : x1 - x0;
  const barCount = Math.max(1, Math.round(barRun / 1820));
  const bg = beamGuess(ridgeX ? y1 - y0 : x1 - x0, 1820);
  for (let i = 0; i <= barCount; i++) {
    const t = i / barCount;
    const a: P3 = ridgeX
      ? { x: x0 + barSpan * t, y: y0, z: base + bg.section.h / 2 }
      : { x: x0, y: y0 + barSpan * t, z: base + bg.section.h / 2 };
    const b: P3 = ridgeX
      ? { x: x0 + barSpan * t, y: y1, z: base + bg.section.h / 2 }
      : { x: x1, y: y0 + barSpan * t, z: base + bg.section.h / 2 };
    push(
      c, 'koyabari', bg.section, a, b, 'matsu',
      `屋根の重さを受けて桁に渡す小屋梁です。${bg.note}`,
      '小屋裏から。曲がった松の丸太が使われていることもあります',
    );
  }
  if (!bg.inTable) c.outOfRange.push(bg.note);

  // 垂木は棟から軒へ、455mmごと
  const eave = roof.eaveMm || 600;
  const trRun = ridgeX ? x1 - x0 : y1 - y0;
  const tn = Math.floor((trRun + eave * 2) / 455);
  const trSec = { w: 45, h: kawara ? 75 : 60 };
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i <= tn; i++) {
      const p = -eave + i * 455;
      const pos = (ridgeX ? x0 : y0) + p;
      const eaveOff = half + eave;
      const a: P3 = ridgeX
        ? { x: pos, y: cy, z: ridgeZ }
        : { x: cx, y: pos, z: ridgeZ };
      const b: P3 = ridgeX
        ? { x: pos, y: cy + side * eaveOff, z: ridgeZ - eaveOff * pitch }
        : { x: cx + side * eaveOff, y: pos, z: ridgeZ - eaveOff * pitch };
      push(
        c, 'taruki', trSec, a, b, 'sugi',
        `屋根の面をつくる垂木です。455mmごと、${kawara ? '瓦なので45×75' : '45×60'}`,
        '軒先を下から見上げれば、455mmおきに出ています。ここは外から見えます',
      );
    }
  }
  c.assumptions.push(`屋根勾配 ${roof.pitchSun}寸、軒の出 ${eave}mm で小屋を組んでいます`);
}

/** まぐさ・窓台。開口を広げたいときに、まず問題になるのがここ */
function openingFrames(c: Ctx): void {
  const foot = c.isGround ? OOBIKI_TOP : 0;
  for (const o of c.level.openings) {
    const w = c.level.walls.find((x) => x.id === o.wallId);
    if (!w) continue;
    const a = c.nodeById.get(w.a);
    const b = c.nodeById.get(w.b);
    if (!a || !b) continue;
    const L = dist(a, b);
    if (L < 1) continue;
    const ux = (b.x - a.x) / L;
    const uy = (b.y - a.y) / L;
    // 開口の両脇に少しかかるように伸ばす
    const s0 = Math.max(0, o.offset - 120);
    const s1 = Math.min(L, o.offset + o.width + 120);
    const top = o.sillHeight + o.height;
    const sec = { w: 105, h: o.width > 1820 ? 150 : 105 };
    push(
      c, 'magusa', sec,
      { x: a.x + ux * s0, y: a.y + uy * s0, z: foot + top + sec.h / 2 },
      { x: a.x + ux * s1, y: a.y + uy * s1, z: foot + top + sec.h / 2 },
      'beimatsu',
      `幅${o.width}mmの開口の上をまたぐまぐさです。${o.width > 1820 ? '1間を超えるのでせいが要ります' : ''}`,
      '建具を外して枠の上を見る。開口を広げるなら、まずここが持つかの話になります',
      { wallId: w.id },
    );
    if (o.kind === 'window' && o.sillHeight > 100) {
      push(
        c, 'madodai', { w: 105, h: 105 },
        { x: a.x + ux * s0, y: a.y + uy * s0, z: foot + o.sillHeight - 52 },
        { x: a.x + ux * s1, y: a.y + uy * s1, z: foot + o.sillHeight - 52 },
        'sugi',
        '窓の下枠を受ける窓台です',
        '窓枠の下。内窓を入れるときの取り付け先にもなります',
        { wallId: w.id },
      );
    }
  }
}

/** 天井の下地。野縁と野縁受け */
function ceilingFrame(c: Ctx): void {
  const pts = c.outer;
  if (pts.length < 3) return;
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const y0 = Math.min(...ys), y1 = Math.max(...ys);
  const wX = x1 - x0, wY = y1 - y0;
  const z = c.H - 60;
  // 野縁受けは910ごと、野縁はそれに直交して455ごと
  const alongX = wX <= wY;
  const ukeRun = alongX ? wY : wX;
  for (let i = 1; i < Math.floor(ukeRun / 910); i++) {
    const p = i * 910;
    const a: P3 = alongX ? { x: x0, y: y0 + p, z: z + 45 } : { x: x0 + p, y: y0, z: z + 45 };
    const b: P3 = alongX ? { x: x1, y: y0 + p, z: z + 45 } : { x: x0 + p, y: y1, z: z + 45 };
    if (!pointInPolygon({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, pts)) continue;
    push(
      c, 'nobuchiuke', { w: 45, h: 45 }, a, b, 'sugi',
      '天井を吊る野縁受けです。910mmごと',
      '天井点検口から。天井を張り替えるならここに留めます',
    );
  }
  const nRun = alongX ? wX : wY;
  for (let i = 1; i < Math.floor(nRun / 455); i++) {
    const p = i * 455;
    const a: P3 = alongX ? { x: x0 + p, y: y0, z } : { x: x0, y: y0 + p, z };
    const b: P3 = alongX ? { x: x0 + p, y: y1, z } : { x: x1, y: y0 + p, z };
    if (!pointInPolygon({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, pts)) continue;
    push(
      c, 'nobuchi', { w: 45, h: 45 }, a, b, 'sugi',
      '天井板を留める野縁です。455mmごと',
      '天井点検口から。下地探しでも455mmおきに当たります',
    );
  }
}

/** 貫。古い民家では筋かいの代わりにこれが効いている */
function nuki(c: Ctx): void {
  const foot = c.isGround ? OOBIKI_TOP : 0;
  for (const w of c.level.walls) {
    const a = c.nodeById.get(w.a);
    const b = c.nodeById.get(w.b);
    if (!a || !b) continue;
    if (dist(a, b) < 900) continue;
    for (const frac of [0.25, 0.55, 0.85]) {
      push(
        c, 'nuki', { w: 15, h: 105 },
        { x: a.x, y: a.y, z: foot + c.H * frac },
        { x: b.x, y: b.y, z: foot + c.H * frac },
        'sugi',
        '柱を横につなぐ貫です。土壁の下地にもなり、古い民家ではこれが建物のゆがみを止めています',
        '土壁を落とすと出てきます。抜かないこと。ここを切ると建物の粘りが落ちます',
        { wallId: w.id },
      );
    }
  }
  c.assumptions.push('古民家なので貫を3段で置いています。実際の段数は壁を落とすまで分かりません');
}

/** 筋かい・火打。あるかどうかは開けないと分からないので、そう言う */
function braces(c: Ctx, minka: boolean): void {
  const foot = c.isGround ? OOBIKI_TOP : 0;
  for (const w of c.level.walls) {
    const a = c.nodeById.get(w.a);
    const b = c.nodeById.get(w.b);
    if (!a || !b) continue;
    if (!wallOnOuter(c.outer, a, b)) continue;
    const L = dist(a, b);
    if (L < 900) continue;
    // 1スパンぶんだけ入れる
    const t = Math.min(1820 / L, 1);
    push(
      c, 'sujikai', { w: 45, h: 90 },
      { x: a.x, y: a.y, z: foot },
      { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: c.H },
      'sugi',
      minka
        ? '古い民家では筋かいの代わりに貫と土壁で持たせていることが多く、無い場合もあります'
        : '外周の壁には、ゆがみ止めの筋かいが入っているのが普通です',
      '壁を開けないと分かりません。ここは推定のままにしておいてください',
      { wallId: w.id },
    );
  }
  c.assumptions.push('筋かいの位置は推定です。実際にどこに入っているかは、壁を開けるまで分かりません');

  // 火打は床と小屋の四隅
  const pts = c.outer;
  if (pts.length >= 4) {
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]!;
      const q = pts[(i + 1) % pts.length]!;
      const r = pts[(i + 2) % pts.length]!;
      const L1 = dist(p, q), L2 = dist(q, r);
      if (L1 < 1000 || L2 < 1000) continue;
      const t1 = 910 / L1, t2 = 910 / L2;
      push(
        c, 'hiuchi', { w: 90, h: 90 },
        { x: q.x + (p.x - q.x) * t1, y: q.y + (p.y - q.y) * t1, z: c.H + 90 },
        { x: q.x + (r.x - q.x) * t2, y: q.y + (r.y - q.y) * t2, z: c.H + 90 },
        'matsu',
        '四隅に斜めに入って、床や小屋が水平にゆがむのを止めます（標準納まり図では火打材90×90）',
        '天井裏の隅を見る。金物の火打に替わっていることもあります',
      );
    }
  }
}

// ── 拾い出し ────────────────────────────────────────

export interface FrameQuantity {
  kind: MemberKind;
  label: string;
  /** 代表的な断面。混ざっていれば最も多いもの */
  section: Section;
  count: number;
  /** 総長さ m */
  totalM: number;
  /** 材積 m3 */
  volumeM3: number;
  /** 確かめ済みの本数 */
  checked: number;
}

/** 何本・何m・何m3。買い出しと見積のもとになる */
export function frameTakeoff(frame: Frame): FrameQuantity[] {
  const by = new Map<MemberKind, Member[]>();
  for (const m of frame.members) {
    const list = by.get(m.kind);
    if (list) list.push(m);
    else by.set(m.kind, [m]);
  }
  const out: FrameQuantity[] = [];
  for (const [kind, list] of by) {
    const sizes = new Map<string, number>();
    for (const m of list) {
      const k = `${m.section.w}x${m.section.h}`;
      sizes.set(k, (sizes.get(k) ?? 0) + 1);
    }
    const top = [...sizes.entries()].sort((a, b) => b[1] - a[1])[0]![0].split('x');
    const totalMm = list.reduce((s, m) => s + len3(m), 0);
    const volume = list.reduce(
      (s, m) => s + (m.section.w / 1000) * (m.section.h / 1000) * (len3(m) / 1000),
      0,
    );
    out.push({
      kind,
      label: MEMBER_LABEL[kind],
      section: { w: Number(top[0]), h: Number(top[1]) },
      count: list.length,
      totalM: Math.round(totalMm / 1000 * 10) / 10,
      volumeM3: Math.round(volume * 1000) / 1000,
      checked: list.filter((m) => m.confidence === 'measured').length,
    });
  }
  return out.sort((a, b) => b.volumeM3 - a.volumeM3);
}

// ── 壁を抜く話 ──────────────────────────────────────

export interface WallLoad {
  wallId: string;
  /** この壁の上に載っている横架材 */
  carrying: Member[];
  /** この壁に含まれる柱 */
  posts: Member[];
  /** 筋かいが入っている見込みか */
  braced: boolean;
  /** 画面に出す一言 */
  verdict: string;
  /** 必ず専門家に見てもらう必要があるか */
  needsExpert: boolean;
}

/**
 * この壁の上に何が載っているかを言う。
 * 「抜ける／抜けない」は決して言わない。それは構造の専門家の仕事。
 */
export function wallLoad(frame: Frame, wallId: string): WallLoad {
  const mine = frame.members.filter((m) => m.wallId === wallId);
  const carrying = mine.filter((m) => m.kind === 'keta' || m.kind === 'doubuchi');
  const posts = mine.filter((m) => m.kind === 'toshibashira' || m.kind === 'kudabashira');
  const braced = mine.some((m) => m.kind === 'sujikai');
  const through = posts.some((m) => m.kind === 'toshibashira');

  // 壁の上を横切る梁も拾う（壁に紐付かないので位置で見る）
  const parts: string[] = [];
  if (carrying.some((m) => m.kind === 'doubuchi')) parts.push('2階の床を受ける胴差');
  else if (carrying.length) parts.push('上からの重さを渡す桁');
  if (through) parts.push('通し柱');
  if (braced) parts.push('ゆがみ止めの筋かい（推定）');

  const needsExpert = through || braced || carrying.some((m) => m.kind === 'doubuchi');
  const verdict = parts.length
    ? `この壁には ${parts.join('・')} が見込まれます。${
        needsExpert
          ? '抜くなら、必ず構造の分かる人に見てもらってください'
          : '抜くまえに、上に何が載っているかを実際に見て確かめてください'
      }`
    : 'この壁の上に載っているものは見当たりませんが、実際に見て確かめてください';

  return { wallId, carrying, posts, braced, verdict, needsExpert };
}

/** 見て確かめた結果を入れる。ここだけが confidence を上げられる */
export function recordFound(frame: Frame, memberId: string, found: MemberFound): Frame {
  return {
    ...frame,
    members: frame.members.map((m) =>
      m.id === memberId
        ? {
            ...m,
            found,
            section: found.section ?? m.section,
            species: found.species ?? m.species,
            confidence: 'measured' as Confidence,
          }
        : m,
    ),
  };
}
