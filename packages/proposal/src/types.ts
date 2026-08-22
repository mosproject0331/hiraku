import type { RenovationOp } from '@hiraku/core';
import type { DesiredUse } from '@hiraku/rules';

/**
 * 改修案を組み立てるための型。
 *
 * 案は「安い・普通・高い」の三段ではない。
 * その場を何のための場にするのか（芯）が違えば、手の入れ方の順番が変わる。
 * ここでは、芯・順番・やらないことを持てる形にしておく。
 */

/** 誰が手を動かすか */
export type Hands = 'self' | 'together' | 'pro' | 'licensed';

export const HANDS_LABEL: Record<Hands, string> = {
  self: '自分たちで',
  together: '仲間と一緒に',
  pro: '職人に頼む',
  licensed: '有資格者に頼む（選べない）',
};

/**
 * 手を入れる順番。大工の段取りと同じで、順番を間違えると二度手間になる。
 * 1 = 許認可・安全に要る（これが通らないと開けられない）
 * 2 = 客を呼ぶ（開けた日に効く）
 * 3 = あとまわし（開けてからでも間に合う）
 */
export type Stage = 1 | 2 | 3;

export const STAGE_LABEL: Record<Stage, string> = {
  1: '開けるために要る',
  2: '開けた日に効く',
  3: 'あとからでいい',
};

export interface WorkStep {
  id: string;
  /** 何をするか */
  title: string;
  /** なぜ今これなのか */
  why: string;
  stage: Stage;
  by: Hands;
  ops: RenovationOp[];
  /** 先に確かめないと動けないこと */
  blockedBy?: string[];
  /** 外せない手か。予算を詰めるときも残す */
  essential?: boolean;
  /** この手が効く根拠になっている、確かめた事実 */
  basedOn?: string[];
}

export interface Proposal {
  id: string;
  /** 案の名前。方針を名乗る */
  name: string;
  /** ひとことで言うと */
  line: string;
  /** なぜこの案なのか。芯と建物の事実に結びつける */
  because: string;
  steps: WorkStep[];
  /** 今回はやらないと決めること。引き算も設計 */
  notNow: string[];
  /** 置いている前提。ここが崩れると案も崩れる */
  assumptions: string[];
  /** 次の一手。多くて2つに絞る */
  nextTwo: string[];
  /** 予算に対する見込み。聞いていなければ budgetYen は undefined */
  fit: {
    lowYen: number;
    highYen: number;
    budgetYen?: number;
    /** 予算をはみ出しているか */
    over: boolean;
    /** 予算に収めるために外した手 */
    trimmed: string[];
  };
}

/** ヒアリングで集める、その人の側の条件 */
export interface HearingProfile {
  /** 芯: この場は何のための場か（本人の言葉のまま） */
  core?: string;
  use?: DesiredUse;
  /** 誰が来るか */
  guests?: 'neighbours' | 'travellers' | 'members' | 'family';
  /** どれくらい開けるか */
  cadence?: 'daily' | 'weekend' | 'seasonal' | 'appointment';
  /** 同時に何人いる場か */
  capacity?: number;
  /** 使えるお金(円) */
  budgetYen?: number;
  /** いつまでに開けたいか(YYYY-MM) */
  openBy?: string;
  /** 自分で手を動かしたい度合い 0=全部おまかせ 3=できるだけ自分たちで */
  hands?: 0 | 1 | 2 | 3;
  /** 一緒に動ける人の数 */
  helpers?: number;
  /** 手放せないもの */
  keep?: string[];
  /** 近隣で気にしていること */
  neighbours?: string[];
  /** お金の回り方 */
  revenue?: 'none' | 'breakeven' | 'profit';
  /** 住みながらか */
  liveIn?: boolean;
}

/** 建物と法規の側の条件。画面から集めてくる */
export interface SiteFacts {
  /** 内見・劣化ピンで見つかった、手を入れないといけないところ */
  troubles: Trouble[];
  /** 診断で出た、確かめる必要のあること */
  permits: string[];
  /** 用途地域などの判定 */
  verdict?: 'ok' | 'conditional' | 'hard' | 'ng' | 'unknown';
  /** 延床(㎡)。用途変更の目安に使う */
  floorAreaM2?: number;
}

export interface Trouble {
  /** 雨漏り・腐朽・蟻害・傾き・設備・その他 */
  category: string;
  /** どこで見つけたか */
  where: string;
  /** 見た人のメモ */
  memo: string;
  /** 放っておけない度合い */
  severity: 'watch' | 'bad';
}
