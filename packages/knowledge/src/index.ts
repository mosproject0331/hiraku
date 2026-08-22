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
  /**
   * 安全・法令・お金の取り返しがつかない論点。
   * こころの問いより先に出す（黙っていると事故や停止に直結するため）。
   */
  urgent?: boolean;
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
    id: 'talk-to-two',
    kind: 'kokoro',
    source: 'pattern-02 わくわく提案',
    text: '2人で考えていると、話は深まる代わりに閉じていきます。いま面白がっていることを、外に一度こぼしてみませんか。本気で楽しんでいる様子そのものが、次の仲間を連れてきます。',
    when: (s) => s.hasPlans && s.todoDone === 0,
  },
  {
    id: 'roles-from-people',
    kind: 'kokoro',
    source: 'pattern-04 やくわりリノベ',
    text: '手伝ってほしい人の顔を思い浮かべてから、その人に合う役割をつくっていますか。「募集して集める」より、「この人だから頼みたい」の順のほうが、一度来た人が何度も来てくれます。',
    when: (s) => s.hasPlans && s.measuredCount > 0,
  },
  {
    id: 'expert-beside',
    kind: 'kokoro',
    source: 'pattern-05 コミュニティ＋専門家',
    text: '専門家を探すとき、「安く早くやってくれる人」ではなく「素人にもわかるように教えてくれる人」を探してみてください。関わった人みんなの技量が上がり、数年後の補修にも力を貸してもらえます。',
    when: (s) => s.hasPlans,
  },
  {
    id: 'no-blueprint',
    kind: 'kokoro',
    source: 'pattern-06 無用の設計図',
    text: 'できあがった図面を配って作業を割り振ると、手は動いても愛着は生まれません。誰が考えたのか分からなくなるくらい皆で迷った場所こそ、後から効いてきます。決めきらない余白を残せていますか。',
    when: (s) => s.hasPlans && s.roomCount > 0,
  },
  {
    id: 'why-you-started',
    kind: 'kokoro',
    source: 'pattern-07 過去と未来の曲がり角',
    text: '難しい条件が並ぶと、逃げ出したくなる日が必ず来ます。そのときは、この家がこれまでどう使われてきたか、近所の人がどんな記憶を持っているかを思い出してみてください。自分の事情より、その連なりのほうが足を前に出させてくれます。',
    when: (s) => s.hasDiagnosis && s.heavyFindings >= 2 && s.todoDone === 0,
  },
  {
    id: 'always-unfinished',
    kind: 'kokoro',
    source: 'pattern-08 これからも追い風',
    text: '完成させようとしすぎていませんか。空き家活用は、ずっと未完のままでいい種類のものです。今回やらないことを決めておくと、後から関わる人の入る隙間が残ります。',
    when: (s) => s.hasPlans && s.measuredCount > 2,
  },
  {
    id: 'successors',
    kind: 'kokoro',
    source: 'pattern-09 みんなが後継者',
    text: 'ずっと自分が続けなければ、と思っていませんか。魅力づくり・保守・会計を複数人で分けておくと、誰かが抜けても回ります。混乱期はだいたい来ます。来ると知っていれば越えられます。',
    when: (s) => s.hasPlans && s.todoDone > 2,
  },
  {
    id: 'walk-the-town',
    kind: 'kokoro',
    source: 'pattern-20 日頃のアンテナ / 21 地に学ぶ',
    text: 'この物件の周りを、目的なく歩いてみましたか。観光冊子でも行政の案内でも構いません。その町ならではの手がかりは、机の上ではなく道の上で見つかります。近所の方にこの家の思い出を聞けたら、それが一番の資料になります。',
    when: (s) => s.hasDiagnosis && !s.hasPlans,
  },
  {
    id: 'compass',
    kind: 'kokoro',
    source: 'pattern-22 出会いの羅針盤',
    text: '窓口を回るとき、はじめに仲良くなった一人から次の人を紹介してもらう形にすると、話が驚くほど早く進みます。誰から辿るか、思い当たる方はいますか。',
    when: (s) => s.todoTotal > 0 && s.todoDone > 0 && s.todoDone < 3,
  },
  {
    id: 'time-capital',
    kind: 'kokoro',
    source: 'pattern-24 時（とき）持ち',
    text: 'お金や技術が足りないと感じるときは、自分の時間を先に差し出す手があります。地方では長い時間をかけた交換で関係ができています。お金では買えないものは、たいていそこから来ます。',
    when: (s) => s.hasPlans && s.heavyFindings > 0,
  },
  {
    id: 'introduce-out',
    kind: 'kokoro',
    source: 'pattern-25 盛り上げ循環',
    text: '来てくれた人を、近所のお店や人に紹介していますか。紹介した先からの反応を持ち帰って伝えると、輪が回りはじめます。ひとつの建物だけでできることには限りがあります。',
    when: (s) => s.hasPlans && s.todoDone >= 3,
  },
  {
    id: 'gap-not-flaw',
    kind: 'jitsumu',
    urgent: true,
    source: '実務(相続・権利)',
    text: '所有者の登記は確認しましたか。相続登記が済んでいないと、話が進んだ後で相続人全員の合意が必要だと分かり、そこで止まります。実務で最も多い停止理由です。早い段階で登記簿を取っておくと安心です。',
    when: (s) => s.hasDiagnosis && !s.hasPlans,
  },
  {
    id: 'contract-years',
    kind: 'jitsumu',
    urgent: true,
    source: '実務(契約)',
    text: '借りて改修するなら、契約年数と改修費が釣り合っているか確かめてください。3年契約に数百万円を入れると回収できません。原状回復の免除と、所有者に相続が起きたときの扱いも、書面で確認しておきたい項目です。',
    when: (s) => s.hasPlans && s.hasDiagnosis,
  },
  {
    id: 'subsidy-timing',
    kind: 'jitsumu',
    source: '実務(補助金)',
    text: '補助金はほとんどが「あと払い」です。採択されても、工事費はいったん自分で払う必要があります。つなぎの資金をどうするかを、申請より先に考えておいてください。',
    when: (s) => s.hasPlans && s.todoDone > 0,
  },
  {
    id: 'ws-insurance',
    kind: 'jitsumu',
    urgent: true,
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
 * 状態に合う問い・案内を返す。
 * 順序は「取り返しのつかない実務 → こころの問い → その他の実務」。
 * 安全・権利・契約の警告だけは、黙っていると事故や停止に直結するため先に出す。
 * 同じ状態では常に同じ結果(決定的)。
 */
export function nextHints(s: ProjectSignals, max = 3): Hint[] {
  const hit = HINTS.filter((h) => h.when(s));
  const urgent = hit.filter((h) => h.urgent);
  const kokoro = hit.filter((h) => !h.urgent && h.kind === 'kokoro');
  const jitsumu = hit.filter((h) => !h.urgent && h.kind === 'jitsumu');
  return [...urgent, ...kokoro, ...jitsumu].slice(0, max);
}
