import type { RenovationOp, SpaceModel } from '@hiraku/core';
import { readBuilding, wallBetween, type BuildingFacts, type RoomFact } from './read';
import type { HearingProfile, Hands, Proposal, SiteFacts, Stage, WorkStep } from './types';

/**
 * 改修案を組む。
 *
 * 三段の値段ではなく、三つの構えで分ける。
 * 「開けるところから」「芯を太く」「引いて残す」——
 * どれも同じ建物・同じ芯を見ているが、どこに先に手を入れるかが違う。
 *
 * 順番は大工の段取りに合わせる。
 *   一段目 開けるために要る（許認可と安全。ここが通らないと開けられない）
 *   二段目 開けた日に効く（人が触れるところ）
 *   三段目 あとからでいい（暮らしの質。開けてからでも間に合う）
 *
 * 数字はつくらない。ここが決めるのは順番と組み合わせだけで、
 * 金額は @hiraku/estimate が単価表から計算する。
 */

let seq = 0;
const sid = (p: string) => `${p}-${(seq++).toString(36)}`;

/** 部屋が案のなかで担う役 */
export type RoomRole = 'front' | 'wet' | 'quiet' | 'entry' | 'other';

const ROLE_NAME: Record<RoomRole, string> = {
  front: '人を迎える部屋',
  wet: '水回りにする部屋',
  quiet: 'いちばん奥の部屋',
  entry: '入ってすぐの部屋',
  other: 'その部屋',
};

/**
 * 部屋の呼び名。
 * 「部屋1」のような仮の名前しか付いていないときは、案のなかで担う役で呼ぶ。
 * 図面の都合をそのまま人に見せない。
 */
export function roomLabel(r: RoomFact | undefined, role: RoomRole = 'other'): string {
  if (!r) return ROLE_NAME[role];
  if (!/^部屋\d+$/.test(r.name)) return r.name;
  return ROLE_NAME[role];
}

/** 図面の部屋idから、案で使う呼び名を引ける表をつくる */
export function roomNames(model: SpaceModel): Map<string, string> {
  const b = readBuilding(model);
  const map = new Map<string, string>();
  for (const r of b.rooms) {
    const role: RoomRole =
      r.id === b.frontRoomId ? 'front'
      : r.id === b.wetRoomId ? 'wet'
      : r.id === b.quietRoomId ? 'quiet'
      : r.id === b.entryRoomId ? 'entry'
      : 'other';
    map.set(r.id, roomLabel(r, role));
  }
  return map;
}

/** 2027-04 のような入力を、読める形にする */
function whenLabel(v: string | undefined): string {
  if (!v) return '';
  const m = /^(\d{4})[-/.]?(\d{1,2})?/.exec(v.trim());
  if (!m) return v.trim();
  return m[2] ? `${Number(m[1])}年${Number(m[2])}月` : `${Number(m[1])}年`;
}

interface Ctx {
  b: BuildingFacts;
  p: HearingProfile;
  s: SiteFacts;
  byId: Map<string, RoomFact>;
  front?: RoomFact;
  entry?: RoomFact;
  quiet?: RoomFact;
  wet?: RoomFact;
  biggest?: RoomFact;
  /** 手を動かす気持ち。0=おまかせ 3=できるだけ自分たちで */
  hands: number;
}

function handsFor(ctx: Ctx, kind: 'finish' | 'demolition' | 'water' | 'electric' | 'structure'): Hands {
  if (kind === 'water' || kind === 'electric') return 'licensed';
  if (kind === 'structure') return 'pro';
  if (ctx.hands >= 3) return ctx.p.helpers && ctx.p.helpers > 1 ? 'together' : 'self';
  if (ctx.hands === 2) return kind === 'finish' ? 'together' : 'pro';
  return 'pro';
}

/* ────────── 一段目: 開けるために要る ────────── */

/** 内見と劣化ピンで見つかった、放っておけないところ */
function troubleSteps(ctx: Ctx): WorkStep[] {
  const out: WorkStep[] = [];
  const bad = ctx.s.troubles.filter((t) => t.severity === 'bad');
  const watch = ctx.s.troubles.filter((t) => t.severity === 'watch');

  const has = (word: string, list = bad) => list.some((t) => (t.category + t.memo + t.where).includes(word));

  if (has('雨漏')) {
    out.push({
      id: sid('trouble'),
      title: '雨の入り口を止める',
      why: '雨が入っているあいだは、内側に何をしても長持ちしない。仕上げより先に、上を止める。',
      stage: 1,
      by: 'pro',
      ops: [],
      blockedBy: ['屋根・雨樋の状態を屋根屋に見てもらう（足場の要否で金額が大きく変わる）'],
      basedOn: bad.filter((t) => (t.category + t.memo).includes('雨漏')).map((t) => `${t.where}: ${t.memo || t.category}`),
    });
  }
  if (has('腐') || has('床下') || has('沈')) {
    const room = ctx.front ?? ctx.biggest;
    out.push({
      id: sid('trouble'),
      title: '床下を開けて、抜けているところを直す',
      why: '人が乗る床は、仕上げを張り替える前に下地を直す。上から張ると、傷みが見えなくなるだけになる。',
      stage: 1,
      by: 'pro',
      ops: room ? [{ op: 'insulate', target: 'floor', roomId: room.id }] : [],
      blockedBy: ['床下に潜って、土台と大引きの状態を確かめる'],
      basedOn: bad.filter((t) => (t.category + t.memo).includes('腐') || (t.category + t.memo).includes('床')).map((t) => `${t.where}: ${t.memo || t.category}`),
    });
  }
  if (has('蟻') || has('シロアリ')) {
    out.push({
      id: sid('trouble'),
      title: 'シロアリの被害範囲を確かめて、防除する',
      why: '被害の範囲が分からないうちは、どこまで直すかが決められない。金額の幅がいちばん大きく動くところ。',
      stage: 1,
      by: 'licensed',
      ops: [],
      blockedBy: ['防除業者に点検を依頼する'],
    });
  }
  if (has('傾')) {
    out.push({
      id: sid('trouble'),
      title: '傾きの原因を、建築士に見てもらう',
      why: '建具が閉まらない原因が沈下なら、内装を直しても戻る。原因の特定は資格のいる仕事。',
      stage: 1,
      by: 'licensed',
      ops: [],
      blockedBy: ['建築士に現地を見てもらう'],
    });
  }
  if (!out.length && watch.length) {
    out.push({
      id: sid('trouble'),
      title: '気になったところを、もう一度見に行く',
      why: `内見で「気になる」を付けた${watch.length}件は、まだ判断がついていない。ここが決まらないと金額が決まらない。`,
      stage: 1,
      by: 'self',
      ops: [],
      basedOn: watch.slice(0, 3).map((t) => `${t.where}: ${t.memo || t.category}`),
    });
  }
  return out;
}

/** 用途から来る、開けるために要る工事 */
function permitSteps(ctx: Ctx, strategy: Strategy): WorkStep[] {
  const out: WorkStep[] = [];
  const use = ctx.p.use;
  const wet = ctx.wet;
  const front = ctx.front;

  if (use === 'cafe' || use === 'home_plus') {
    if (wet) {
      out.push({
        id: sid('permit'),
        title: `${roomLabel(wet, 'wet')}に厨房をつくる`,
        why: '飲食店営業許可は、厨房が区画されていること・手洗いがあることが前提になる。ここが決まらないと開けられない。外壁に面していて、排水と換気を外に出せる位置を選んである。',
        stage: 1,
        by: 'licensed',
        ops: [
          { op: 'add_water_unit', roomId: wet.id, unit: 'kitchen', routeNote: '外壁側で排水を外に出せる位置を想定。現地で既存の配管位置を確かめること' },
          { op: 'add_water_unit', roomId: wet.id, unit: 'sink', routeNote: '手洗いは厨房内に別に要る（保健所の基準）' },
        ],
        blockedBy: ['保健所に事前相談し、必要な設備の基準を確かめる'],
      });
    }
    out.push({
      id: sid('permit'),
      title: '厨房の電気を、専用の回路にする',
      why: '冷蔵庫・製氷機・エスプレッソが同じ回路に乗ると落ちる。開けてから足すと壁を二度開けることになる。',
      stage: 1,
      by: 'licensed',
      ops: [{ op: 'electrical', work: 'add_circuit', count: strategy === 'core' ? 3 : 2 }],
      blockedBy: ['電力の契約容量を確かめる（アンペア数と分電盤の空き）'],
    });
  }

  if (use === 'minpaku' || use === 'kani_shukuhaku') {
    if (wet) {
      out.push({
        id: sid('permit'),
        title: `${roomLabel(wet, 'wet')}に、泊まれるだけの水回りを入れる`,
        why: '泊まる場は、風呂と便所の数で泊まれる人数が決まる。ここが先に決まらないと、部屋の割り方も決められない。',
        stage: 1,
        by: 'licensed',
        ops: [
          { op: 'add_water_unit', roomId: wet.id, unit: 'toilet', routeNote: '既存の排水に近い位置を想定。現地で確かめること' },
          { op: 'add_water_unit', roomId: wet.id, unit: 'bath', routeNote: '給湯器の位置と能力の確認が要る' },
        ],
        blockedBy: ['保健所（旅館業）または自治体（住宅宿泊事業）に事前相談する'],
      });
    }
    out.push({
      id: sid('permit'),
      title: '逃げ道を二つ確保する',
      why: '泊まる場は、寝ている人が逃げられることが要る。窓の大きさと位置は、あとから変えるのがいちばん高くつく。',
      stage: 1,
      by: 'pro',
      ops: [],
      blockedBy: ['消防署（予防課）に、必要な設備と避難経路を確かめる'],
    });
  }

  if (use === 'atelier') {
    out.push({
      id: sid('permit'),
      title: '機械のための電気を先に引く',
      why: '工作機械は単相では足りないことがある。電気は壁を仕上げる前に通す。',
      stage: 1,
      by: 'licensed',
      ops: [{ op: 'electrical', work: 'add_circuit', count: 2 }],
      blockedBy: ['使う機械の消費電力と、動力（三相）の要否を確かめる'],
    });
  }

  if (use === 'sharehouse') {
    out.push({
      id: sid('permit'),
      title: '各室の採光と、逃げ道を確かめる',
      why: '人が住む部屋には、窓の大きさの決まりがある。窓の無い部屋を個室にはできない。',
      stage: 1,
      by: 'pro',
      ops: [],
      blockedBy: ['建築指導課に、寄宿舎扱いになるかを確かめる'],
      basedOn: ctx.b.darkRoomIds.length
        ? [`窓の無い部屋が${ctx.b.darkRoomIds.length}室ある`]
        : undefined,
    });
  }

  if (ctx.s.floorAreaM2 && ctx.s.floorAreaM2 > 200) {
    out.push({
      id: sid('permit'),
      title: '用途変更の手続きを、設計者と組む',
      why: `延床が${Math.round(ctx.s.floorAreaM2)}㎡ある。200㎡を超えると用途変更の確認申請が要る場合があり、工期と費用の前提が変わる。`,
      stage: 1,
      by: 'licensed',
      ops: [],
      blockedBy: ['建築指導課に、用途変更の要否を確かめる'],
    });
  }

  if (front && ctx.b.darkRoomIds.includes(front.id)) {
    out.push({
      id: sid('permit'),
      title: `${roomLabel(front, 'front')}に光を入れる`,
      why: '人を迎える部屋に窓が無い。開口を足すのは構造に関わるので、抜ける壁かどうかを先に確かめる。',
      stage: 1,
      by: 'pro',
      ops: [],
      blockedBy: ['壁を抜いて開口をつくれるか、建築士に確かめる'],
    });
  }

  return out;
}

/* ────────── 二段目・三段目 ────────── */

function finishSteps(ctx: Ctx, strategy: Strategy): WorkStep[] {
  const out: WorkStep[] = [];
  const front = ctx.front;
  const quiet = ctx.quiet;
  const hands = handsFor(ctx, 'finish');

  if (!front) return out;

  if (strategy === 'keep') {
    // 引いて残す: 塗るのは壁だけ。床は既存を掃除して使う
    out.push({
      id: sid('finish'),
      title: `${roomLabel(front, 'front')}の壁だけ塗り直す`,
      why: '床と天井は、この家がここまで持ってきた顔。触らずに残す。壁を白くするだけで、光の回り方は変わる。',
      stage: 2,
      by: hands,
      ops: [{ op: 'change_wall_finish', roomId: front.id, finishId: 'shikkui_diy' }],
    });
  } else {
    out.push({
      id: sid('finish'),
      title: `${roomLabel(front, 'front')}の床と壁を替える`,
      why: `人が最初に立つ部屋。${front.windowAreaM2 > 0 ? `窓が${front.windows}か所あるので、床の色が変わると部屋の明るさが変わる。` : '光が乏しいので、壁を明るくして返す光を増やす。'}`,
      stage: 2,
      by: hands,
      ops: [
        { op: 'change_floor', roomId: front.id, finishId: front.isDoma ? 'cushion_floor' : 'flooring' },
        { op: 'change_wall_finish', roomId: front.id, finishId: 'shikkui_diy' },
      ],
    });
  }

  out.push({
    id: sid('finish'),
    title: '照明を、天井から下ろす',
    why: '古い家は天井の真ん中に一灯だけのことが多い。灯りを低い位置に分けると、同じ部屋が別の場所になる。',
    stage: 2,
    by: ctx.hands >= 2 ? 'self' : 'licensed',
    ops: [{ op: 'electrical', work: 'lighting_diy', count: strategy === 'open' ? 2 : 3, roomId: front.id }],
  });

  if (strategy !== 'open' && quiet && quiet.id !== front.id) {
    out.push({
      id: sid('finish'),
      title: `${roomLabel(quiet, 'quiet')}は、こもれる部屋として残す`,
      why: '奥まっていて光が少ない部屋は、無理に開けなくていい。閉じられることが値打ちになる使い方がある。',
      stage: 3,
      by: hands,
      ops: quiet.isWashitsu ? [] : [{ op: 'change_floor', roomId: quiet.id, finishId: 'flooring' }],
    });
  }

  return out;
}

function comfortSteps(ctx: Ctx, strategy: Strategy): WorkStep[] {
  const out: WorkStep[] = [];
  const front = ctx.front;
  const stage: Stage = ctx.p.cadence === 'daily' ? 2 : 3;

  if (strategy !== 'open') {
    out.push({
      id: sid('comfort'),
      title: '窓の内側に、もう一枚入れる',
      why:
        ctx.p.cadence === 'daily'
          ? '毎日開ける場所は、寒さがそのまま続かない理由になる。内窓は壁を壊さずに効く。'
          : '古い家の寒さは、ほとんど窓から来る。内窓は入れるのが早く、効き方が分かりやすい。',
      stage,
      by: ctx.hands >= 2 ? 'together' : 'pro',
      ops: [{ op: 'insulate', target: 'window_inner' }],
    });
  }
  if (strategy === 'core' && front) {
    out.push({
      id: sid('comfort'),
      title: '床下に断熱を入れる',
      why: '足元の冷えは、そこにいられる時間を決める。長くいてほしい場所ほど、床から効かせる。',
      stage: 3,
      by: 'pro',
      ops: [{ op: 'insulate', target: 'floor', roomId: front.id }],
    });
  }
  out.push({
    id: sid('comfort'),
    title: 'コンセントを増やす',
    why: '古い家は一部屋に一か所しかないことがある。どこに人が座るかが決まってから位置を決める。',
    stage: 3,
    by: 'licensed',
    ops: [{ op: 'electrical', work: 'add_outlet', count: strategy === 'core' ? 6 : 4 }],
  });
  return out;
}

/** 間仕切りを抜いて一室にする手 */
function openUpStep(ctx: Ctx): WorkStep | null {
  const front = ctx.front;
  if (!front) return null;
  // 迎える部屋と、その隣でいちばん広いところ
  const neighbour = front.neighbours
    .map((id) => ctx.byId.get(id))
    .filter((r): r is RoomFact => !!r)
    .sort((p, q) => q.areaM2 - p.areaM2)[0];
  if (!neighbour) return null;
  const wall = wallBetween(ctx.b, front.id, neighbour.id);
  if (!wall) return null;

  const merged = Math.round((front.areaM2 + neighbour.areaM2) * 10) / 10;
  return {
    id: sid('openup'),
    title: `${roomLabel(front, 'front')}と${roomLabel(neighbour, 'other')}のあいだを抜く`,
    why: `抜くと${merged}㎡の一室になる。仕切りを足すのはあとからでもできるが、抜くのは工事のはじめにしかできない。`,
    stage: 2,
    by: 'pro',
    ops: [{ op: 'remove_partition', wallId: wall.id }],
    blockedBy: ['この壁が構造に効いていないか、建築士に確かめる'],
    basedOn: [`壁の長さ ${(wall.lengthMm / 1000).toFixed(2)}m`],
  };
}

/* ────────── 案を組む ────────── */

type Strategy = 'open' | 'core' | 'keep';

const STRATEGY: Record<Strategy, { name: string; line: string }> = {
  open: {
    name: '開けるところから',
    line: 'まず開けて、使いながら直す。手を入れる場所を、人が立つところだけに絞る。',
  },
  core: {
    name: '芯を太く',
    line: 'この場が何のための場かに、いちばん効くところへ先に投じる。',
  },
  keep: {
    name: '引いて残す',
    line: '足すより抜く。この家がすでに持っているものを、掃除して使い切る。',
  },
};

function orderSteps(steps: WorkStep[]): WorkStep[] {
  const rank: Record<Hands, number> = { licensed: 0, pro: 1, together: 2, self: 3 };
  return [...steps].sort((a, b) => a.stage - b.stage || rank[a.by] - rank[b.by]);
}

function assumptionsFor(ctx: Ctx, steps: WorkStep[]): string[] {
  const out: string[] = [];
  if (ctx.s.verdict === 'unknown') out.push('用途地域がまだ分かっていない。ここが変わると、この案が成り立たないことがある');
  if (!ctx.s.troubles.length) out.push('床下・小屋裏はまだ見ていない。見えていない傷みは、この案に入っていない');
  const structural = steps.some((s) => s.ops.some((o) => o.op === 'remove_partition'));
  if (structural) out.push('抜く壁が構造に効いていないことを前提にしている。建築士の確認が要る');
  const water = steps.some((s) => s.ops.some((o) => o.op === 'add_water_unit'));
  if (water) out.push('既存の給排水が使える位置にあることを前提にしている。引き回しが長いと金額が変わる');
  if (!ctx.p.budgetYen) out.push('予算の上限を聞いていない。どこで止めるかは、あとで一緒に決める');
  return out;
}

function notNowFor(ctx: Ctx, strategy: Strategy, steps: WorkStep[]): string[] {
  const out: string[] = [];
  const touched = new Set(
    steps.flatMap((s) => s.ops.map((o) => ('roomId' in o && o.roomId ? o.roomId : ''))).filter(Boolean),
  );
  const untouched = ctx.b.rooms.filter((r) => !touched.has(r.id));
  if (untouched.length) {
    out.push(
      `${untouched.slice(0, 3).map((r) => roomLabel(r, 'other')).join('・')}${untouched.length > 3 ? 'ほか' : ''}は今回さわらない。使ってみて足りなければ、次の年に回す`,
    );
  }
  if (strategy === 'open') {
    out.push('断熱は今回入れない。ひと冬つかってみて、寒さがどこから来るかを見てから決める');
    out.push('水回りは既存のまま。設備は使い方が固まってから入れるほうが、置き場所を間違えない');
  }
  if (strategy === 'keep') {
    out.push('床と天井は張り替えない。汚れは落とすが、色と傷はこの家の履歴として残す');
    out.push('新しい建具は入れない。今ある戸を直して使う');
  }
  if (strategy === 'core') {
    out.push('奥の部屋の仕上げは後回し。芯に関わらないところに先に使うと、肝心なところで足りなくなる');
  }
  if (ctx.p.keep?.length) {
    out.push(`${ctx.p.keep.join('・')}は動かさない。ここは工事の前に、残し方を決めておく`);
  }
  return out;
}

function becauseFor(ctx: Ctx, strategy: Strategy): string {
  const core = ctx.p.core?.trim();
  const front = ctx.front;
  const bits: string[] = [];

  if (core) bits.push(`「${core}」を芯に置くなら、`);
  if (strategy === 'open') {
    bits.push(
      ctx.p.openBy
        ? `${whenLabel(ctx.p.openBy)}という締切がある以上、そこに間に合う形にすることが先。`
        : '使ってみないと決められないことが多い。だから、まず開ける形にする。',
    );
    if (front) bits.push(`手を入れるのは${roomLabel(front, 'front')}だけに絞る。`);
  } else if (strategy === 'core') {
    bits.push('その芯を成り立たせている一点に、先にお金を置く。');
    if (front) {
      bits.push(
        front.windowAreaM2 > 0
          ? `${roomLabel(front, 'front')}は窓が${front.windows}か所あって、この家でいちばん光が入る。ここを場の中心にする。`
          : `${roomLabel(front, 'front')}が入口にいちばん近い。ここを場の中心にする。`,
      );
    }
  } else {
    bits.push('古い家の値打ちは、新しくした部分ではなく、残った部分に出る。');
    bits.push('抜くのは仕切りだけにして、材と時間はそのまま使う。');
  }
  if (ctx.hands >= 3) bits.push('自分たちで手を動かす前提で、資格の要らない仕事を多く残してある。');
  else if (ctx.hands === 0) bits.push('工事は職人に任せる前提で組んである。');
  return bits.join('');
}

export function buildProposals(model: SpaceModel, profile: HearingProfile, site: SiteFacts): Proposal[] {
  seq = 0;
  const b = readBuilding(model);
  const byId = new Map(b.rooms.map((r) => [r.id, r] as const));
  const ctx: Ctx = {
    b,
    p: profile,
    s: site,
    byId,
    front: b.frontRoomId ? byId.get(b.frontRoomId) : undefined,
    entry: b.entryRoomId ? byId.get(b.entryRoomId) : undefined,
    quiet: b.quietRoomId ? byId.get(b.quietRoomId) : undefined,
    wet: b.wetRoomId ? byId.get(b.wetRoomId) : undefined,
    biggest: b.biggestRoomId ? byId.get(b.biggestRoomId) : undefined,
    hands: profile.hands ?? 2,
  };
  if (!b.rooms.length) return [];

  const strategies: Strategy[] = ['open', 'core', 'keep'];
  return strategies.map((strategy) => {
    const steps: WorkStep[] = [
      ...troubleSteps(ctx),
      ...permitSteps(ctx, strategy),
      ...(strategy === 'open' ? [] : [openUpStep(ctx)].filter((x): x is WorkStep => !!x)),
      ...finishSteps(ctx, strategy),
      ...comfortSteps(ctx, strategy),
    ];
    const ordered = orderSteps(steps);
    const nextTwo = ordered
      .filter((s) => s.stage === 1)
      .slice(0, 2)
      .map((s) => (s.blockedBy?.[0] ? s.blockedBy[0] : s.title));
    return {
      id: `plan-${strategy}`,
      name: STRATEGY[strategy].name,
      line: STRATEGY[strategy].line,
      because: becauseFor(ctx, strategy),
      steps: ordered,
      notNow: notNowFor(ctx, strategy, ordered),
      assumptions: assumptionsFor(ctx, ordered),
      nextTwo: nextTwo.length ? nextTwo : ordered.slice(0, 2).map((s) => s.title),
    };
  });
}

/** 案から、見積に渡す op の並びを取り出す */
export function opsOf(p: Proposal): RenovationOp[] {
  return p.steps.flatMap((s) => s.ops);
}
