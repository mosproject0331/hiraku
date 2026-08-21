/**
 * 場づくりナレッジ層(§15) v0。
 *
 * 空き家活用パターンランゲージ(建石ほか・27パターン)を骨格として、
 * プロジェクトの状態から「いま考えてみてほしい問い」を返す。
 *
 * 設計判断(akiya-pattern-ai D10/D15を踏襲):
 * - パターン名・段階名は利用者に一切出さない。問いの形でだけ現れる
 * - こころの層(kokoro)は案内せず問いを返す。実務の層(jitsumu)ははっきり案内する
 * - 出典パターンIDは内部フィールド(source)として保持し、管理・チューニング用に使う
 */

export interface ProjectSignals {
  hasModel: boolean;
  roomCount: number;
  hasDiagnosis: boolean;
  /** 診断でng/hardだった件数 */
  heavyFindings: number;
  hasPlans: boolean;
  measuredCount: number;
  pinCount: number;
  todoTotal: number;
  todoDone: number;
}

export interface Hint {
  id: string;
  kind: 'kokoro' | 'jitsumu';
  /** 内部参照用の出典(UIに出さない) */
  source: string;
  text: string;
  when: (s: ProjectSignals) => boolean;
}

export const HINTS: Hint[] = [
  {
    id: 'persona',
    kind: 'kokoro',
    source: 'pattern-10 空き家の人格',
    text: 'この家を人だとしたら、どんな生き様をしてきた人でしょう。性格は明るいですか、暗いですか。そこにはどんな音楽が流れていそうですか。何に使うかより先に、この像がはっきりしてくると、この先のたくさんの判断が楽になります。',
    when: (s) => !s.hasDiagnosis && !s.hasPlans,
  },
  {
    id: 'companion',
    kind: 'kokoro',
    source: 'pattern-01 冒険の相棒',
    text: 'この先の道のりを一緒に歩く相棒は、誰の顔が浮かびますか。いま一番仲が良い人とは限りません。うまくいくかどうかより、人生の話ができる相手かどうかで考えてみてください。',
    when: (s) => !s.hasPlans && s.todoDone === 0,
  },
  {
    id: 'gap-as-seed',
    kind: 'kokoro',
    source: 'pattern-11 隙間探し',
    text: '診断に×や△が並ぶと止まりたくなりますが、それはこの家が「空いている理由」そのものです。制約を消すべき欠点ではなく、ここにしかない使い方の種として眺め直すと、0からでは誰も思いつかない案が出てくることがあります。',
    when: (s) => s.hasDiagnosis && s.heavyFindings > 0,
  },
  {
    id: 'everyday',
    kind: 'kokoro',
    source: 'pattern-12 日常に溶け込む',
    text: 'その計画は、自分たちの日々の暮らしの延長にありますか。事業計画としての正しさより先に、背伸びをしていないかを一度だけ確かめてください。気軽に始められる形は、長く続く形でもあります。',
    when: (s) => s.hasPlans,
  },
  {
    id: 'subtraction',
    kind: 'kokoro',
    source: 'pattern-14 場からの引き算',
    text: '足すものより先に、残すものは決まっていますか。煤や傷、古い建具——この家が持っている物語は、一度剥がすと戻りません。「引き算してから足す」の順番が、場の説得力をつくります。',
    when: (s) => s.hasPlans,
  },
  {
    id: 'open-worry',
    kind: 'kokoro',
    source: 'pattern-03 悩みを開く',
    text: '窓口への相談は、悩みを完璧に整理してからでなくて大丈夫です。分からないことを分からないまま話すほうが、思ってもみないところから助けてくれる人が現れます。',
    when: (s) => s.hasDiagnosis && s.todoTotal > 0 && s.todoDone === 0,
  },
  {
    id: 'ws-before-answer',
    kind: 'kokoro',
    source: 'pattern-13 ありたい中身WS',
    text: '先進事例や正解を探す前に、「ここでどうすれば豊かな時間が流れるか」を、一緒にやる人や地域の人と話してみませんか。その人たちからしか出てこない話が、案をここにしかないものにします。',
    when: (s) => s.hasDiagnosis && !s.hasPlans,
  },
  {
    id: 'hands-on',
    kind: 'kokoro',
    source: 'pattern-16 体感できる準備',
    text: '工事の中に、誰でもできる作業をどれだけ残せていますか。手を動かした人は、その場所を自分の場所だと思うようになります。効率だけで専門業者に寄せすぎない配分も、場づくりの設計のうちです。',
    when: (s) => s.hasPlans,
  },
  {
    id: 'ws-insurance',
    kind: 'jitsumu',
    source: '実務(施工WS安全)',
    text: '施工を手伝ってくれる人の保険(傷害・施設賠償)は決めましたか。ボランティアの怪我はイベント保険等でカバーできます。ここが抜けたまま事故が起きると、活動そのものが止まります。工具の使い方説明と記録もセットで。',
    when: (s) => s.hasPlans,
  },
  {
    id: 'no-pins',
    kind: 'jitsumu',
    source: '実務(現況調査)',
    text: '劣化ピンがまだ0件です。雨漏りの跡・床の沈み・シロアリの痕は、見なかったことにすると後で一番高くつきます。現地で気づいたことは小さくても図に落としておきましょう。',
    when: (s) => s.hasModel && s.measuredCount > 0 && s.pinCount === 0,
  },
  {
    id: 'measure-more',
    kind: 'jitsumu',
    source: '実務(実測)',
    text: '間取りの大半がまだ推定(グレー)です。長い壁から2〜3本測るだけで図全体が締まり、見積の数量も確かになります。計測ナビの提案から測ってみてください。',
    when: (s) => s.hasModel && s.roomCount > 0 && s.measuredCount === 0,
  },
];

/**
 * 状態に合う問い・案内を返す。こころ優先で最大max件。
 * 同じ状態では常に同じ結果(決定的)。
 */
export function nextHints(s: ProjectSignals, max = 2): Hint[] {
  const hit = HINTS.filter((h) => h.when(s));
  const kokoro = hit.filter((h) => h.kind === 'kokoro');
  const jitsumu = hit.filter((h) => h.kind === 'jitsumu');
  return [...kokoro, ...jitsumu].slice(0, max);
}
