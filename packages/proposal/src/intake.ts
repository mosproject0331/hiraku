import type { DesiredUse } from '@hiraku/rules';
import type { HearingProfile, SiteFacts } from './types';

/**
 * ヒアリング。
 *
 * 順番は「効く順」。最初に芯を聞き、そのあとで条件を詰める。
 * どの問いにも「なぜ聞くのか」を添える。答えが何に効くのか分からないまま
 * 答えさせるのは、こちらの都合でしかない。
 *
 * 分かっていることは聞かない。図面・診断・内見から拾えるものは飛ばす。
 */

export type Answer = string | number | string[] | boolean | undefined;

export interface Option {
  value: string;
  label: string;
  hint?: string;
}

export interface Question {
  id: keyof HearingProfile;
  /** 聞くこと */
  ask: string;
  /** なぜ聞くのか */
  why: string;
  kind: 'text' | 'choice' | 'number' | 'tags' | 'scale';
  options?: Option[];
  unit?: string;
  placeholder?: string;
  /** 飛ばしていい問いか */
  optional?: boolean;
}

const USE_OPTIONS: { value: DesiredUse; label: string }[] = [
  { value: 'cafe', label: 'カフェ・飲食' },
  { value: 'minpaku', label: '宿（民泊）' },
  { value: 'kani_shukuhaku', label: '宿（簡易宿所）' },
  { value: 'sharehouse', label: 'シェアハウス' },
  { value: 'atelier', label: 'アトリエ・工房' },
  { value: 'retail', label: '物販' },
  { value: 'coworking', label: 'コワーキング・事務所' },
  { value: 'library', label: '私設図書館' },
  { value: 'home_plus', label: '住まい＋α' },
];

export const QUESTIONS: Question[] = [
  {
    id: 'core',
    ask: 'その場所で、いちばん起きてほしいことは何ですか。',
    why: 'これを芯にします。話が坪数や金額に流れたとき、ここに戻って組み直します。',
    kind: 'text',
    placeholder: '例: 平日の昼に、近所の人がふらっと寄って座れる',
  },
  {
    id: 'use',
    ask: '形にするなら、いちばん近いのはどれですか。',
    why: '用途で、要る許可と工事の順番が変わります。ここが決まると法規の当たりが付きます。',
    kind: 'choice',
    options: USE_OPTIONS,
  },
  {
    id: 'guests',
    ask: '来るのは、どういう人ですか。',
    why: '来る人で、入口から先の道のつくり方が変わります。',
    kind: 'choice',
    options: [
      { value: 'neighbours', label: '近所の人', hint: '歩いて来る。滞在は短め' },
      { value: 'travellers', label: '外から来る人', hint: '車。荷物がある' },
      { value: 'members', label: '決まった人たち', hint: '常連・会員' },
      { value: 'family', label: '身内・自分たち', hint: '公開しない' },
    ],
  },
  {
    id: 'cadence',
    ask: 'どれくらいの頻度で開けますか。',
    why: '毎日開けるなら、寒さと動線に先にお金がかかります。週末だけなら後回しにできます。',
    kind: 'choice',
    options: [
      { value: 'daily', label: 'ほぼ毎日' },
      { value: 'weekend', label: '週末だけ' },
      { value: 'seasonal', label: '季節ごと' },
      { value: 'appointment', label: '約束したときだけ' },
    ],
  },
  {
    id: 'capacity',
    ask: '同時に何人いる場にしたいですか。',
    why: '人数で、要る広さ・便所の数・逃げ道の考え方が変わります。',
    kind: 'number',
    unit: '人',
  },
  {
    id: 'hands',
    ask: '自分たちで手を動かしたい気持ちは、どれくらいですか。',
    why: '同じ工事でも、誰がやるかで金額が何倍も変わります。ただし電気と給排水は資格が要るので選べません。',
    kind: 'scale',
    options: [
      { value: '0', label: '全部おまかせ' },
      { value: '1', label: '少しなら' },
      { value: '2', label: '半分くらい' },
      { value: '3', label: 'できるだけ自分たちで' },
    ],
  },
  {
    id: 'helpers',
    ask: '一緒に手を動かせる人は、何人いますか。',
    why: '塗る・剥がすは人数で早さが変わります。二人と六人では、組み方が違います。',
    kind: 'number',
    unit: '人',
    optional: true,
  },
  {
    id: 'budgetYen',
    ask: '今回の改修に使えるお金は、いくらまでですか。',
    why: 'どこで止めるかを決めるために聞きます。足りない前提でも案は出せます。',
    kind: 'number',
    unit: '円',
    optional: true,
  },
  {
    id: 'openBy',
    ask: 'いつまでに開けたいですか。',
    why: '締切があると、順番の付け方が変わります。間に合わせる形と、じっくりやる形は別の案になります。',
    kind: 'text',
    placeholder: '例: 2027-04',
    optional: true,
  },
  {
    id: 'revenue',
    ask: 'お金は、どう回す想定ですか。',
    why: '稼ぐ必要の度合いで、先に手を入れる場所が変わります。',
    kind: 'choice',
    options: [
      { value: 'none', label: '稼がなくていい' },
      { value: 'breakeven', label: '維持できれば充分' },
      { value: 'profit', label: '生活を支えたい' },
    ],
    optional: true,
  },
  {
    id: 'keep',
    ask: '動かせないもの、残したいものはありますか。',
    why: '仏壇・大黒柱・庭の木。ここは工事の前に決めておかないと、あとで戻せません。',
    kind: 'tags',
    placeholder: '例: 仏壇, 大黒柱, 柿の木',
    optional: true,
  },
  {
    id: 'neighbours',
    ask: 'ご近所のことで、気にしていることはありますか。',
    why: '音・匂い・駐車。許可より先に、ここでつまずくことがあります。',
    kind: 'tags',
    placeholder: '例: 夜の音, 駐車場が狭い',
    optional: true,
  },
  {
    id: 'liveIn',
    ask: 'そこに住みながらやりますか。',
    why: '住みながらだと、工事を止められる期間と、分けたい場所が出てきます。',
    kind: 'choice',
    options: [
      { value: 'yes', label: '住みながら' },
      { value: 'no', label: '住まない' },
    ],
    optional: true,
  },
];

/** すでに答えが埋まっているか */
export function isAnswered(p: HearingProfile, id: keyof HearingProfile): boolean {
  const v = p[id];
  if (v === undefined || v === null) return false;
  if (typeof v === 'string') return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

/** 次に聞くべきこと。無ければ null（案を出せる） */
export function nextQuestion(p: HearingProfile, site?: SiteFacts): Question | null {
  for (const q of QUESTIONS) {
    if (isAnswered(p, q.id)) continue;
    // 診断で用途が決まっているなら聞き直さない
    if (q.id === 'use' && p.use) continue;
    void site;
    return q;
  }
  return null;
}

/** 案を出せる状態か。芯と用途だけは要る */
export function canPropose(p: HearingProfile): boolean {
  return isAnswered(p, 'core') && isAnswered(p, 'use');
}

export function intakeProgress(p: HearingProfile): { answered: number; total: number; required: number } {
  const required = QUESTIONS.filter((q) => !q.optional).length;
  const answered = QUESTIONS.filter((q) => isAnswered(p, q.id)).length;
  return { answered, total: QUESTIONS.length, required };
}

/** 画面から来た文字列を、プロフィールの型に直す */
export function applyAnswer(p: HearingProfile, q: Question, raw: Answer): HearingProfile {
  const next: HearingProfile = { ...p };
  switch (q.id) {
    case 'core':
    case 'openBy':
      next[q.id] = String(raw ?? '').trim();
      break;
    case 'use':
      next.use = String(raw) as DesiredUse;
      break;
    case 'guests':
      next.guests = String(raw) as HearingProfile['guests'];
      break;
    case 'cadence':
      next.cadence = String(raw) as HearingProfile['cadence'];
      break;
    case 'revenue':
      next.revenue = String(raw) as HearingProfile['revenue'];
      break;
    case 'hands': {
      const n = Number(raw);
      next.hands = (Number.isFinite(n) ? Math.max(0, Math.min(3, Math.round(n))) : 2) as 0 | 1 | 2 | 3;
      break;
    }
    case 'capacity':
    case 'helpers':
    case 'budgetYen': {
      const n = Number(raw);
      if (Number.isFinite(n) && n >= 0) next[q.id] = n;
      break;
    }
    case 'keep':
    case 'neighbours':
      next[q.id] = Array.isArray(raw)
        ? raw
        : String(raw ?? '')
            .split(/[,、\s]+/)
            .map((s) => s.trim())
            .filter(Boolean);
      break;
    case 'liveIn':
      next.liveIn = raw === true || raw === 'yes';
      break;
    default:
      break;
  }
  return next;
}
