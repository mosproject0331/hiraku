import { describe, expect, it } from 'vitest';
import { deserialize, validateOps, type SpaceModel } from '@hiraku/core';
import sample from '@hiraku/core/fixtures/sample-minka.json';
import {
  applyAnswer, buildProposals, canPropose, nextQuestion, opsOf, QUESTIONS, readBuilding,
  type HearingProfile, type SiteFacts,
} from '../src/index';

const model: SpaceModel = deserialize(JSON.stringify(sample));

const baseProfile: HearingProfile = {
  core: '平日の昼に、近所の人がふらっと寄って座れる',
  use: 'cafe',
  guests: 'neighbours',
  cadence: 'daily',
  capacity: 12,
  hands: 3,
  helpers: 4,
};
const emptySite: SiteFacts = { troubles: [], permits: [] };

describe('建物を読む', () => {
  const b = readBuilding(model);

  it('部屋ごとに、窓・外壁・隣を数えている', () => {
    expect(b.rooms.length).toBeGreaterThan(1);
    for (const r of b.rooms) {
      expect(r.areaM2).toBeGreaterThan(0);
      expect(r.exteriorWalls).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(r.neighbours)).toBe(true);
    }
  });

  it('迎える部屋・奥の部屋・水回りの候補を決めている', () => {
    expect(b.frontRoomId).toBeTruthy();
    expect(b.quietRoomId).toBeTruthy();
    expect(b.wetRoomId).toBeTruthy();
  });

  it('奥まり具合は玄関から数える', () => {
    const entry = b.rooms.find((r) => r.id === b.entryRoomId);
    expect(entry?.depthFromEntry).toBe(0);
    const quiet = b.rooms.find((r) => r.id === b.quietRoomId);
    expect(quiet!.depthFromEntry).toBeGreaterThanOrEqual(entry!.depthFromEntry);
  });

  it('内壁は2部屋のあいだにあるものだけ', () => {
    for (const w of b.innerWalls) expect(w.between[0]).not.toBe(w.between[1]);
  });
});

describe('案を組む', () => {
  const plans = buildProposals(model, baseProfile, emptySite);

  it('三つの構えを返す', () => {
    expect(plans).toHaveLength(3);
    expect(plans.map((p) => p.name)).toEqual(['開けるところから', '芯を太く', '引いて残す']);
  });

  it('どの案も、芯を引いて理由を語る', () => {
    for (const p of plans) {
      expect(p.because).toContain(baseProfile.core!);
      expect(p.because.length).toBeGreaterThan(30);
    }
  });

  it('手順は段（開けるために要る→開けた日に効く→あとから）の順に並ぶ', () => {
    for (const p of plans) {
      const stages = p.steps.map((s) => s.stage);
      expect([...stages].sort((a, b) => a - b)).toEqual(stages);
    }
  });

  it('やらないことを必ず言う', () => {
    for (const p of plans) expect(p.notNow.length).toBeGreaterThan(0);
  });

  it('前提を明かす', () => {
    for (const p of plans) expect(p.assumptions.length).toBeGreaterThan(0);
  });

  it('次の一手は多くて2つ', () => {
    for (const p of plans) expect(p.nextTwo.length).toBeLessThanOrEqual(2);
  });

  it('組んだ op は、この間取りに対して成立する', () => {
    for (const p of plans) {
      const errs = validateOps(model, opsOf(p)).filter((i) => i.level === 'error');
      expect(errs).toEqual([]);
    }
  });

  it('案ごとに手の入れ方が違う', () => {
    const sets = plans.map((p) => p.steps.map((s) => s.title).join('|'));
    expect(new Set(sets).size).toBe(3);
  });

  it('電気と給排水は、必ず有資格者に振る', () => {
    for (const p of plans) {
      for (const s of p.steps) {
        const needsLicence = s.ops.some((o) => o.op === 'add_water_unit' || (o.op === 'electrical' && o.work !== 'lighting_diy'));
        if (needsLicence) expect(s.by).toBe('licensed');
      }
    }
  });

  it('構造にさわる手には、必ず確かめることが付く', () => {
    for (const p of plans) {
      for (const s of p.steps) {
        if (s.ops.some((o) => o.op === 'remove_partition')) {
          expect(s.blockedBy?.join('')).toContain('建築士');
        }
      }
    }
  });
});

describe('建物と人の条件が案に効く', () => {
  it('傷んでいるところが見つかっていれば、一段目に入る', () => {
    const site: SiteFacts = {
      troubles: [
        { category: '雨漏り', where: '和室Aの天井', memo: 'シミが広がっている', severity: 'bad' },
        { category: '腐朽', where: '土間の床下', memo: '踏むと沈む', severity: 'bad' },
      ],
      permits: [],
    };
    const plans = buildProposals(model, baseProfile, site);
    for (const p of plans) {
      const first = p.steps.filter((s) => s.stage === 1).map((s) => s.title).join('|');
      expect(first).toContain('雨の入り口');
      expect(first).toContain('床下');
    }
  });

  it('自分でやる気がないなら、仕上げも職人に振る', () => {
    const plans = buildProposals(model, { ...baseProfile, hands: 0 }, emptySite);
    const finish = plans[1]!.steps.find((s) => s.ops.some((o) => o.op === 'change_wall_finish'));
    expect(finish?.by).toBe('pro');
  });

  it('残したいものは、やらないことに書かれる', () => {
    const plans = buildProposals(model, { ...baseProfile, keep: ['仏壇', '大黒柱'] }, emptySite);
    expect(plans[0]!.notNow.join('')).toContain('仏壇');
  });

  it('延床が200㎡を超えるなら、用途変更の手が入る', () => {
    const plans = buildProposals(model, baseProfile, { troubles: [], permits: [], floorAreaM2: 260 });
    expect(plans[0]!.steps.map((s) => s.title).join('|')).toContain('用途変更');
  });

  it('宿なら、逃げ道の確認が入る', () => {
    const plans = buildProposals(model, { ...baseProfile, use: 'minpaku' }, emptySite);
    expect(plans[0]!.steps.map((s) => s.title).join('|')).toContain('逃げ道');
  });

  it('用途地域が分からないなら、そのことを前提に書く', () => {
    const plans = buildProposals(model, baseProfile, { troubles: [], permits: [], verdict: 'unknown' });
    expect(plans[0]!.assumptions.join('')).toContain('用途地域');
  });
});

describe('ヒアリング', () => {
  it('最初に聞くのは芯', () => {
    expect(nextQuestion({})!.id).toBe('core');
  });

  it('答えたら次へ進み、必須が埋まれば案が出せる', () => {
    let p: HearingProfile = {};
    let guard = 0;
    while (guard++ < 40) {
      const q = nextQuestion(p);
      if (!q) break;
      const raw =
        q.kind === 'number' ? 4 : q.kind === 'scale' ? 2 : q.options ? q.options[0]!.value : 'こたえ';
      p = applyAnswer(p, q, raw);
    }
    expect(nextQuestion(p)).toBeNull();
    expect(canPropose(p)).toBe(true);
  });

  it('芯と用途だけあれば案は出せる', () => {
    expect(canPropose({ core: 'a', use: 'cafe' })).toBe(true);
    expect(canPropose({ core: 'a' })).toBe(false);
  });

  it('どの問いにも「なぜ聞くのか」がある', () => {
    for (const q of QUESTIONS) {
      expect(q.why.length).toBeGreaterThan(10);
      expect(q.ask.length).toBeGreaterThan(5);
    }
  });

  it('タグは読点でも区切れる', () => {
    const q = QUESTIONS.find((x) => x.id === 'keep')!;
    expect(applyAnswer({}, q, '仏壇、大黒柱 柿の木').keep).toEqual(['仏壇', '大黒柱', '柿の木']);
  });
});

describe('聞いた答えが、案に効く', () => {
  it('予算を下げると、後ろの段から手が減る', () => {
    const rich = buildProposals(model, { ...baseProfile, budgetYen: 20_000_000 }, emptySite);
    const tight = buildProposals(model, { ...baseProfile, budgetYen: 300_000 }, emptySite);
    for (let i = 0; i < 3; i++) {
      expect(tight[i]!.steps.length).toBeLessThan(rich[i]!.steps.length);
      // 一段目（開けるために要る）は削らない
      const stage1Rich = rich[i]!.steps.filter((s) => s.stage === 1).length;
      const stage1Tight = tight[i]!.steps.filter((s) => s.stage === 1).length;
      expect(stage1Tight).toBe(stage1Rich);
    }
  });

  it('削った手は、黙って消さずに理由つきで見せる', () => {
    const tight = buildProposals(model, { ...baseProfile, budgetYen: 300_000 }, emptySite);
    expect(tight[0]!.fit.trimmed.length).toBeGreaterThan(0);
    expect(tight[0]!.notNow.join('')).toContain('予算');
  });

  it('予算を聞いていなければ、削らないし over とも言わない', () => {
    const p = buildProposals(model, { ...baseProfile, budgetYen: undefined }, emptySite);
    expect(p[0]!.fit.budgetYen).toBeUndefined();
    expect(p[0]!.fit.trimmed).toEqual([]);
    expect(p[0]!.fit.over).toBe(false);
  });

  it('見込みは、高いほうで予算と突き合わせる', () => {
    const p = buildProposals(model, { ...baseProfile, budgetYen: 5_000_000 }, emptySite)[0]!;
    expect(p.fit.highYen).toBeGreaterThanOrEqual(p.fit.lowYen);
    expect(p.fit.over).toBe(p.fit.highYen > 5_000_000);
  });

  it('近所で気にしていることは、一段目の手になる', () => {
    const p = buildProposals(model, { ...baseProfile, neighbours: ['夜の音', '駐車場が狭い'] }, emptySite)[0]!;
    const step = p.steps.find((s) => s.title.includes('近所'));
    expect(step).toBeTruthy();
    expect(step!.stage).toBe(1);
    expect(step!.blockedBy!.join('')).toContain('音');
    expect(step!.blockedBy!.join('')).toContain('車');
  });

  it('住みながらなら、暮らしと営業を分ける手が入る', () => {
    const p = buildProposals(model, { ...baseProfile, liveIn: true }, emptySite)[0]!;
    expect(p.steps.map((s) => s.title).join('|')).toContain('暮らす側');
    const off = buildProposals(model, { ...baseProfile, liveIn: false }, emptySite)[0]!;
    expect(off.steps.map((s) => s.title).join('|')).not.toContain('暮らす側');
  });

  it('来る人で、入口まわりの手が変わる', () => {
    const t = buildProposals(model, { ...baseProfile, guests: 'travellers' }, emptySite)[0]!;
    const n = buildProposals(model, { ...baseProfile, guests: 'neighbours' }, emptySite)[0]!;
    expect(t.steps.map((s) => s.title).join('|')).toContain('荷物');
    expect(n.steps.map((s) => s.title).join('|')).toContain('通りから見て');
  });

  it('人数が多いカフェなら、便所が二つ要ると言う', () => {
    const few = buildProposals(model, { ...baseProfile, capacity: 6 }, emptySite)[0]!;
    const many = buildProposals(model, { ...baseProfile, capacity: 20 }, emptySite)[0]!;
    expect(few.steps.map((s) => s.title).join('|')).not.toContain('便所');
    expect(many.steps.map((s) => s.title).join('|')).toContain('便所');
  });

  it('生活を支える収入が要るなら、開け続けられる形にする手が入る', () => {
    const p = buildProposals(model, { ...baseProfile, revenue: 'profit', cadence: 'daily' }, emptySite)[1]!;
    expect(p.steps.map((s) => s.title).join('|')).toContain('開け続けられる');
  });

  it('聞いた13問のうち、案に効かないものが無い', () => {
    const base = buildProposals(model, baseProfile, emptySite);
    const sig = (p: typeof base) => p.map((x) => x.steps.map((s) => s.title).join('|') + x.notNow.join('|') + x.because).join('##');
    const changes: Record<string, boolean> = {
      guests: sig(buildProposals(model, { ...baseProfile, guests: 'travellers' }, emptySite)) !== sig(base),
      capacity: sig(buildProposals(model, { ...baseProfile, capacity: 20 }, emptySite)) !== sig(base),
      neighbours: sig(buildProposals(model, { ...baseProfile, neighbours: ['夜の音'] }, emptySite)) !== sig(base),
      revenue: sig(buildProposals(model, { ...baseProfile, revenue: 'profit' }, emptySite)) !== sig(base),
      liveIn: sig(buildProposals(model, { ...baseProfile, liveIn: true }, emptySite)) !== sig(base),
      budgetYen: sig(buildProposals(model, { ...baseProfile, budgetYen: 300_000 }, emptySite)) !== sig(base),
      openBy: sig(buildProposals(model, { ...baseProfile, openBy: '2027-04' }, emptySite)) !== sig(base),
      hands: sig(buildProposals(model, { ...baseProfile, hands: 0 }, emptySite)) !== sig(base),
      keep: sig(buildProposals(model, { ...baseProfile, keep: ['仏壇'] }, emptySite)) !== sig(base),
      cadence: sig(buildProposals(model, { ...baseProfile, cadence: 'seasonal' }, emptySite)) !== sig(base),
      core: sig(buildProposals(model, { ...baseProfile, core: '別の芯' }, emptySite)) !== sig(base),
      use: sig(buildProposals(model, { ...baseProfile, use: 'minpaku' }, emptySite)) !== sig(base),
    };
    const dead = Object.entries(changes).filter(([, v]) => !v).map(([k]) => k);
    expect(dead).toEqual([]);
  });
});
