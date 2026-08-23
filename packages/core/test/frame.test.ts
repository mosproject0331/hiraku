import { describe, expect, it } from 'vitest';
import { deserialize } from '../src/serialize';
import {
  applyFound, beamGuess, buildFrame, frameTakeoff, recordFound, wallLoad, MEMBER_LABEL, MEMBER_ROLE,
} from '../src/frame';
import { outerBoundary } from '../src/rooms';
import { levelBaseY } from '../src/levels';
import { interiorCameras } from '../src/scene';
import { signedAreaMm2 } from '../src/geometry';
import sample from '../fixtures/sample-minka.json';
import type { Roof } from '../src/types';

const model = deserialize(JSON.stringify(sample));
const roof: Roof = {
  shape: 'gable', pitchSun: 4, eaveMm: 900, ridge: 'x', material: 'kawara', exposeCeiling: false,
};
const withRoof = { ...model, roof };
const frame = buildFrame(withRoof, 0, { minka: true });
const areaM2 = Math.abs(signedAreaMm2(outerBoundary(model.levels[0]!))) / 1e6;

describe('軸組を組む', () => {
  it('土台から垂木まで、ひととおり入る', () => {
    const kinds = new Set(frame.members.map((m) => m.kind));
    for (const k of ['dodai', 'kudabashira', 'mabashira', 'keta', 'oobiki', 'yukazuka', 'neda',
      'munagi', 'moya', 'taruki', 'koyazuka', 'koyabari', 'magusa', 'nobuchi'] as const) {
      expect(kinds, `${MEMBER_LABEL[k]}が入っていない`).toContain(k);
    }
  });

  it('長さゼロの部材は作らない', () => {
    for (const m of frame.members) {
      const d = Math.hypot(m.b.x - m.a.x, m.b.y - m.a.y, m.b.z - m.a.z);
      expect(d, `${MEMBER_LABEL[m.kind]} ${m.id} の長さが0`).toBeGreaterThan(1);
    }
  });

  it('最初はすべて推定。実際に見るまで確度は上がらない', () => {
    expect(frame.members.every((m) => m.confidence === 'estimated')).toBe(true);
  });

  it('どの部材にも「なぜそこにあるか」と「どう確かめるか」が付く', () => {
    for (const m of frame.members) {
      expect(m.because.length, m.id).toBeGreaterThan(5);
      expect(m.howToCheck.length, m.id).toBeGreaterThan(5);
      expect(MEMBER_ROLE[m.kind].length).toBeGreaterThan(3);
    }
  });

  it('見て確かめた分だけ確度が上がる', () => {
    const target = frame.members.find((m) => m.kind === 'oobiki')!;
    const after = recordFound(frame, target.id, {
      section: { w: 90, h: 105 }, species: 'hinoki', state: 'watch', memo: '端が湿っている',
    });
    const got = after.members.find((m) => m.id === target.id)!;
    expect(got.confidence).toBe('measured');
    expect(got.section).toEqual({ w: 90, h: 105 });
    // 他の部材は動かさない
    expect(after.members.filter((m) => m.confidence === 'measured')).toHaveLength(1);
  });
});

describe('梁せいの見当（北海道立林産試験場スパン表 すぎ甲種1級 幅105mm）', () => {
  it('表のとおりに出る', () => {
    // 負担幅0.91m
    expect(beamGuess(2730, 910).section.h).toBe(120);
    expect(beamGuess(3640, 910).section.h).toBe(180);
    expect(beamGuess(4550, 910).section.h).toBe(240);
    expect(beamGuess(5460, 910).section.h).toBe(270);
    expect(beamGuess(6370, 910).section.h).toBe(330);
    // 負担幅1.82m は深くなる
    expect(beamGuess(3640, 1820).section.h).toBe(270);
  });

  it('スパンが伸びればせいも伸びる', () => {
    let prev = 0;
    for (const s of [2730, 3640, 4550, 5460, 6370]) {
      const h = beamGuess(s, 910).section.h;
      expect(h).toBeGreaterThanOrEqual(prev);
      prev = h;
    }
  });

  it('表の外に出たら、そう言う', () => {
    const g = beamGuess(8000, 1820);
    expect(g.inTable).toBe(false);
    expect(g.note).toContain('設計者');
  });

  it('製材の規定寸法に乗る', () => {
    const ladder = [105, 120, 135, 150, 180, 210, 240, 270, 300, 330, 360, 390];
    for (const s of [2000, 2730, 3000, 3640, 4200, 4550, 5460, 6370]) {
      expect(ladder).toContain(beamGuess(s, 910).section.h);
    }
  });
});

describe('拾い出し', () => {
  const q = frameTakeoff(frame);

  it('材積の大きい順に並ぶ', () => {
    for (let i = 1; i < q.length; i++) {
      expect(q[i - 1]!.volumeM3).toBeGreaterThanOrEqual(q[i]!.volumeM3);
    }
  });

  it('本数と総長さが部材と合う', () => {
    const total = q.reduce((s, x) => s + x.count, 0);
    expect(total).toBe(frame.members.length);
  });

  it('土台の材積は 断面×総長さ と一致する', () => {
    const d = q.find((x) => x.kind === 'dodai')!;
    const expected = (d.section.w / 1000) * (d.section.h / 1000) * d.totalM;
    expect(d.volumeM3).toBeCloseTo(expected, 2);
  });

  /**
   * 相場との突き合わせ。
   * 在来軸組工法の木材使用量は 0.191 m3/m2（全国木材組合連合会）、
   * 実測の幅は 0.15〜0.25 m3/m2（富山県木材組合連合会）。
   * ただしこの数字は造作材・野地板・下地材を含む「木材使用量」であり、
   * こちらが出しているのは軸組だけなので、下に外れるのが正しい。
   * 半分を切ったら組み落としを疑う。相場を超えたら過剰に置いている。
   */
  it('延床あたりの材積が、木材使用量の相場に対して妥当な位置にある', () => {
    const total = q.reduce((s, x) => s + x.volumeM3, 0);
    const per = total / areaM2;
    expect(per).toBeGreaterThan(0.095); // 相場の下限0.15の半分より上
    expect(per).toBeLessThan(0.191);    // 造作込みの平均は超えない
  });
});

describe('壁の上に何が載っているか', () => {
  it('「抜ける」とは決して言わない', () => {
    for (const w of model.levels[0]!.walls) {
      const l = wallLoad(frame, w.id);
      expect(l.verdict).not.toMatch(/抜けます|抜いて大丈夫|撤去できます|問題ありません/);
      expect(l.verdict).toMatch(/確かめ|見てもらって/);
    }
  });

  it('通し柱や筋かいを含む壁は、専門家を要求する', () => {
    const braced = model.levels[0]!.walls
      .map((w) => wallLoad(frame, w.id))
      .filter((l) => l.braced || l.posts.some((p) => p.kind === 'toshibashira'));
    expect(braced.length).toBeGreaterThan(0);
    for (const l of braced) {
      expect(l.needsExpert).toBe(true);
      expect(l.verdict).toContain('構造の分かる人');
    }
  });
});

describe('前提は隠さない', () => {
  it('組み立てに使った前提が読める形で返る', () => {
    expect(frame.assumptions.length).toBeGreaterThan(3);
    expect(frame.assumptions.join()).toContain('筋かいの位置は推定');
  });
});

describe('確かめた記録が迷子にならない', () => {
  it('組み直してもIDが変わらない', () => {
    const again = buildFrame(withRoof, 0, { minka: true });
    expect(again.members.map((m) => m.id)).toEqual(frame.members.map((m) => m.id));
  });

  it('IDは位置から作られるので、生成順に依らない', () => {
    for (const m of frame.members) {
      expect(m.id).toMatch(/^[a-z]+:-?\d+,-?\d+,-?\d+>-?\d+,-?\d+,-?\d+$/);
    }
    // 同じIDが2本出ない
    expect(new Set(frame.members.map((m) => m.id)).size).toBe(frame.members.length);
  });

  it('保存した記録を貼り直せる', () => {
    const target = frame.members.find((m) => m.kind === 'taruki')!;
    const saved = { [target.id]: { section: { w: 45, h: 90 }, species: 'sugi' as const, state: 'ok' as const } };
    const back = applyFound(buildFrame(withRoof, 0, { minka: true }), saved);
    const got = back.members.find((m) => m.id === target.id)!;
    expect(got.confidence).toBe('measured');
    expect(got.section).toEqual({ w: 45, h: 90 });
    expect(back.members.filter((m) => m.confidence === 'measured')).toHaveLength(1);
  });

  it('もう存在しない部材の記録は、静かに無視される', () => {
    const back = applyFound(frame, { 'dodai:99999,99999,0>99999,99999,0': { state: 'bad' } });
    expect(back.members.every((m) => m.confidence === 'estimated')).toBe(true);
  });
});

describe('階を上げてもカメラが置き去りにならない', () => {
  it('2階を見るときは、カメラも2階の床の上にいる', () => {
    // 2階のある家を組む
    const two = { ...model, levels: [model.levels[0]!, { ...model.levels[0]!, id: 'L2', name: '2階' }] };
    const g = levelBaseY(two, 1);
    expect(g).toBeGreaterThan(2.4);
    for (const c of interiorCameras(two, 3, 1)) {
      expect(c.position[1], c.label).toBeGreaterThan(g);
      expect(c.position[1] - g).toBeLessThan(2.0); // 目の高さのまま
      expect(c.target[1]).toBeCloseTo(c.position[1], 5);
    }
    // 1階は今までどおり
    for (const c of interiorCameras(two, 3, 0)) {
      expect(c.position[1]).toBeCloseTo(1.45, 5);
    }
  });
});
