export type DiyClass = 'diy' | 'diy_hard' | 'licensed' | 'pro_recommended' | 'permit_related';

/**
 * その数字が「何の値段」なのか。
 *
 * ここを混ぜると見積が壊れる。畳の表替えは材料費ではないし、
 * 残置物の処分に材料は無い。数字より先に、種別を持たせる。
 */
export type PriceBasis =
  /** 材料だけ。自分で買って自分で施工する前提 */
  | 'material'
  /** 機器・製品の本体価格。取り付けは別 */
  | 'equipment'
  /** 施工込み。業者に頼む前提の値段 */
  | 'installed'
  /** 手間・処分・清掃。物が残らない */
  | 'service';

export const BASIS_LABEL: Record<PriceBasis, string> = {
  material: '材料のみ',
  equipment: '機器の本体価格',
  installed: '施工込み',
  service: '手間・処分',
};

export const BASIS_NOTE: Record<PriceBasis, string> = {
  material: '自分たちで施工する前提。手間はこの数字に入っていません',
  equipment: '本体だけの価格。取り付け費は別に要ります',
  installed: '業者に頼む前提の値段。手間が入っています',
  service: '物は残りません。量と距離で大きく動きます',
};

export interface UnitPrice {
  low: number;
  high: number;
  /** 何の値段か */
  basis: PriceBasis;
  /** どこから来た数字か */
  source: string;
  /** いつ時点の数字か (YYYY-MM) */
  asOf?: string;
  /** 出どころを確かめた数字か。自分で入れた単価は true */
  verified: boolean;
  /** どこの相場か */
  region?: string;
}

export interface WorkItem {
  id: string;
  category: string;
  name: string;
  unit: '㎡' | 'm' | '箇所' | '式' | '枚';
  materialUnitPrice: UnitPrice;
  diyClass: DiyClass;
  requiredLicense?: string;
  permitNote?: string;
  steps: string[];
  marketNote?: string;
}

/**
 * 初期値。全国一律の「正しい単価」は存在しない
 * （ホームセンターの値段でさえ店舗ごとに違う）。
 * だからここは「よく見かける幅」でしかなく、未検証として扱う。
 * 使う人が自分の単価帳を入れて初めて、確かな数字になる。
 */
const P = (low: number, high: number, basis: PriceBasis = 'material') =>
  ({ low, high, basis, source: '一般的なレンジ（未検証）', verified: false });

/**
 * 出どころを確かめた単価。
 * 実際に売られている値段を、店名と時点つきで持つ。
 * 「確かめた」とは、誰でも同じ場所を見に行けるという意味。
 */
const V = (low: number, high: number, source: string, asOf: string, basis: PriceBasis = 'material') =>
  ({ low, high, basis, source, asOf, verified: true });

/** 工事項目マスタ(§7)。単価はすべてプレースホルダのレンジ(参考値・要検証) */
export const WORK_ITEMS: WorkItem[] = [
  // 解体
  { id: 'demo-partition', category: '解体', name: '間仕切り壁の撤去', unit: '㎡', materialUnitPrice: V(1000, 3000, '自分で解体する前提の処分費。解体石膏ボードの処分 20,000円/m³＝両面12.5mmで約500円/㎡、これに下地の木くずと運搬が乗る。職人に頼む場合は6畳間の壁1枚で5万〜10万円（壁面約6.5㎡＝7,700〜15,400円/㎡）、壁跡の補修は別途1.5万〜2万円', '2026-08', 'service'), diyClass: 'diy_hard',
    steps: ['構造に関わらない壁か専門家に確認する', '電気配線・スイッチの有無を確認し、あれば電気工事士に依頼', '養生してボード・下地を解体する', '廃材を分別して処分する'],
    marketNote: '専門施工なら処分費込みで㎡あたり数千円の桁(参考・要検証)' },
  { id: 'demo-floor', category: '解体', name: '床の解体(仕上げ+下地)', unit: '㎡', materialUnitPrice: P(500, 1500, 'service'), diyClass: 'diy_hard',
    steps: ['床下の状態(腐朽・シロアリ)を先に確認する', 'バール等で仕上げ材を剥がす', '下地の再利用可否を判断する', '廃材を分別処分する'] },
  { id: 'demo-ceiling', category: '解体', name: '天井の解体', unit: '㎡', materialUnitPrice: P(500, 1500, 'service'), diyClass: 'diy_hard',
    steps: ['粉じん対策(防じんマスク・ゴーグル)を必ずする', '照明・配線を外す(配線側は電気工事士)', '天井板を剥がし小屋裏の状態を確認する'] },
  { id: 'demo-zanchi', category: '解体', name: '残置物の処分', unit: '式', materialUnitPrice: V(50000, 300000, '戸建て一軒家の残置物撤去 10万〜30万円。2トントラック1台なら3万〜6万円（撤去業者各社の公表相場）', '2026-08', 'service'), diyClass: 'diy',
    steps: ['使えるもの・売れるもの・思い出の品を仕分ける', '自治体の粗大ごみ・クリーンセンターに持ち込む', '量が多ければ一般廃棄物収集運搬の許可業者に依頼する'],
    marketNote: '業者依頼はトラック1台あたり数万円の桁(参考・要検証)' },
  // 木工事
  { id: 'carp-floor-shitaji', category: '木工事', name: '床下地の組み直し', unit: '㎡', materialUnitPrice: P(2000, 5000), diyClass: 'diy_hard',
    steps: ['レーザーで水平を出す', '大引・根太を組む', '断熱材を入れるならこの段階で', '合板を張る'] },
  { id: 'carp-neda-hoshu', category: '木工事', name: '根太・大引の部分補修', unit: 'm', materialUnitPrice: P(1500, 4000), diyClass: 'diy_hard',
    steps: ['腐朽範囲を特定する', '同寸の材に差し替える', '束の沈みは束で調整する'] },
  { id: 'carp-partition', category: '木工事', name: '間仕切り壁の新設(下地+ボード)', unit: '㎡', materialUnitPrice: V(1800, 6000, 'せっこうボード12.5mm 798円/枚＝482円/㎡（カインズ）×両面＋下地材。公表価格は1,950円/枚＝1,177円/㎡（積算資料公表価格版2026年9月号）', '2026-08'), diyClass: 'diy_hard',
    steps: ['位置を墨出しする', '天地の桟と間柱を組む', '石膏ボードを両面に張る', 'パテ処理する'] ,
    marketNote: 'ホームセンター実売と公表価格で2.4倍の開きがある。どちらで買うかで金額が変わる'},
  { id: 'carp-opening', category: '木工事', name: '開口部の新設(建具枠まで)', unit: '箇所', materialUnitPrice: P(15000, 60000, 'installed'), diyClass: 'pro_recommended',
    steps: ['構造上問題ない壁か専門家に確認する', 'まぐさ・柱の補強を入れる', '枠を取り付ける'],
    marketNote: '構造の確認が前提。壁の種類で費用が大きく変わる' },
  { id: 'carp-close-opening', category: '木工事', name: '開口部の閉鎖(壁化)', unit: '箇所', materialUnitPrice: P(8000, 30000), diyClass: 'diy_hard',
    steps: ['建具・枠を外す', '下地を組んでボードを張る', '外壁側は防水に注意(外部関連は専門家に)'] },
  { id: 'carp-shelf', category: '木工事', name: '造作棚', unit: '箇所', materialUnitPrice: P(5000, 30000), diyClass: 'diy',
    steps: ['下地(間柱)の位置を探す', '棚受けを固定する', '棚板を載せる'] },
  { id: 'carp-tategu-chosei', category: '木工事', name: '建具の調整・修理', unit: '箇所', materialUnitPrice: P(500, 5000, 'service'), diyClass: 'diy',
    steps: ['敷居・鴨居の擦れを確認する', '戸車交換・鉋がけで調整する'] },
  // 内装
  { id: 'flooring', category: '内装', name: 'フローリング張り', unit: '㎡', materialUnitPrice: V(2500, 12000, '複合の量産品を下限、突板・無垢を上限。無垢チークは16,800円/㎡（積算資料公表価格版2026年9月号）', '2026-08'), diyClass: 'diy',
    steps: ['下地の水平・強度を確認する', '割付を決める', 'サネをはめながら張る', '巾木を回す'] ,
    marketNote: '幅・厚み・樹種で何倍も動く。無垢は上限を超えることがある'},
  { id: 'cushion_floor', category: '内装', name: 'クッションフロア張り', unit: '㎡', materialUnitPrice: V(800, 2500, 'DIYショップRESTA 切売り 1,408円/m(幅182cm)＝774円/㎡ を下限に', '2026-08'), diyClass: 'diy',
    steps: ['下地を平滑にする', '仮敷きして切り込む', '接着剤で張る'] ,
    marketNote: '下限は量産品の切売り。柄物・厚手・土足対応は上がる'},
  { id: 'tatami_omote', category: '内装', name: '畳の表替え', unit: '枚', materialUnitPrice: V(3000, 12000, '表替え 1畳あたり3,000〜12,000円（畳店各社の公表相場）。国産い草・熊本産は上限側', '2026-08', 'installed'), diyClass: 'pro_recommended',
    steps: ['畳店に枚数を伝えて見積をとる', '朝出し夕方納品が一般的'] },
  { id: 'cloth', category: '内装', name: '壁クロス張り', unit: '㎡', materialUnitPrice: V(400, 1800, '生のり付き壁紙 362〜490円/m(幅92cm)＝394〜533円/㎡（RESTA・かべがみ道場）', '2026-08'), diyClass: 'diy_hard',
    steps: ['下地パテ処理する', '糊付きクロスを張る', 'ジョイントをカットする'] },
  { id: 'shikkui_diy', category: '内装', name: '漆喰・珪藻土塗り(DIY向け製品)', unit: '㎡', materialUnitPrice: V(1900, 4200, '練済み漆喰18kg 15,180円・1mm厚で約16㎡（日本プラスター）＝2回塗りで約1,900円/㎡', '2026-08'), diyClass: 'diy',
    steps: ['養生する', 'シーラーを塗る', 'コテやローラーで2回塗りする'],
    marketNote: 'ワークショップ向きの定番作業' },
  { id: 'paint', category: '内装', name: '室内塗装(壁・木部)', unit: '㎡', materialUnitPrice: V(250, 1200, '水性多用途 1L 1,000〜3,000円・2回塗りで3〜5㎡/L（塗料の相場記事・アサヒペン等）', '2026-08'), diyClass: 'diy',
    steps: ['養生する', '下地を清掃・ヤニ止めする', '2回塗りする'] },
  { id: 'ceiling_paint', category: '内装', name: '天井塗装', unit: '㎡', materialUnitPrice: V(250, 1200, '水性多用途 1L 1,000〜3,000円・2回塗りで3〜5㎡/L', '2026-08'), diyClass: 'diy',
    steps: ['照明を外し養生する', 'ローラーで2回塗りする(上向き作業は保護メガネ)'] },
  { id: 'ceiling_board', category: '内装', name: '天井板張り替え', unit: '㎡', materialUnitPrice: P(2500, 6000), diyClass: 'diy_hard',
    steps: ['下地の状態を確認する', '野縁を調整する', '板を張る'] },
  // 建具
  { id: 'door-replace', category: '建具', name: '室内ドア交換', unit: '箇所', materialUnitPrice: P(20000, 60000, 'equipment'), diyClass: 'diy_hard',
    steps: ['枠の歪みを確認する', '既製建具の寸法を合わせる', '丁番・ハンドルを付ける'] },
  { id: 'window_inner', category: '建具', name: '内窓の設置', unit: '箇所', materialUnitPrice: V(50000, 110000, '内窓の工事込み実勢。腰高窓カタログ100,800円／掃出し窓205,700円、実勢はその半分程度。掃出し窓の工事例108,900円（内窓リフォームネット・さくら住建）', '2026-08', 'installed'), diyClass: 'pro_recommended',
    steps: ['窓枠の内寸を採寸する', 'メーカーに発注する', 'レールをビス留めして障子をはめる'],
    marketNote: '断熱効果が大きく、補助金の対象になることが多い' },
  { id: 'amido', category: '建具', name: '網戸の新調・張替え', unit: '枚', materialUnitPrice: P(2000, 8000), diyClass: 'diy',
    steps: ['ゴムの太さを確認する', 'ネットをローラーで押し込む'] },
  // 水回り
  { id: 'kitchen', category: '水回り', name: 'キッチン交換・新設', unit: '式', materialUnitPrice: V(200000, 1200000, '本体のみ。ベーシックなI型で20万〜60万円、ミドル〜ハイグレードで60万〜120万円超。解体・組立・給排水/電気/ガス接続の工事費は別途15万〜30万円', '2026-08', 'equipment'), diyClass: 'pro_recommended',
    permitNote: '給排水の接続は指定工事店・有資格者の施工',
    steps: ['給排水・ガス・電気の位置を決める', '本体を発注する', '接続工事は専門業者に依頼する'],
    marketNote: '本体グレードで価格帯が大きく変わる' },
  { id: 'toilet', category: '水回り', name: 'トイレ交換・新設', unit: '式', materialUnitPrice: V(100000, 350000, '便器本体のみ。一般グレード〜タンクレスで10万〜35万円。内装込みの交換工事全体では15万〜50万円', '2026-08', 'equipment'), diyClass: 'pro_recommended',
    permitNote: '給排水の接続は指定工事店・有資格者の施工',
    steps: ['排水芯の位置を確認する', '便器を選定する', '設置・接続は専門業者に依頼する'] },
  { id: 'senmen', category: '水回り', name: '洗面台の交換・新設', unit: '式', materialUnitPrice: V(50000, 250000, '本体のみ。間口750mm前後の三面鏡タイプで10万〜25万円前後、施工費は別途3万〜7万円。工事費込み65,720円からの型落ち品もある', '2026-08', 'equipment'), diyClass: 'pro_recommended',
    steps: ['給排水の位置を確認する', '本体を発注する', '接続は専門業者に依頼する'] },
  { id: 'bath', category: '水回り', name: 'ユニットバス設置', unit: '式', materialUnitPrice: V(500000, 1500000, '既存ユニットバスからの交換が工事費込みで60万〜150万円。最安の工事費込みパックで498,000円〜。在来浴室からの変更は解体・土間・防水が乗って上振れする', '2026-08', 'installed'), diyClass: 'pro_recommended',
    steps: ['サイズが入るか採寸する', '土間打ち・組立・接続は専門業者に依頼する'] },
  { id: 'haisui-koshin', category: '水回り', name: '給排水管の更新', unit: '式', materialUnitPrice: V(150000, 600000, '戸建ての部分交換が10万円台後半、住宅全体の給水管更新で40万円前後、屋外の引込みから室内まで一体でやると60万円超（給排水設備業者の公表相場）', '2026-08', 'installed'), diyClass: 'licensed', requiredLicense: '指定給水装置工事事業者(給水) / 排水設備指定工事店(排水)',
    steps: ['既存管の材質・漏れを調査する', '指定工事店に見積を依頼する'] },
  // 電気
  { id: 'outlet', category: '電気', name: 'コンセント増設', unit: '箇所', materialUnitPrice: V(6000, 30000, '既存配線から分岐 5,000〜7,000円、新規設置 約10,000円、全体平均32,422円で6割が3万円未満（電気工事事業者の集計）', '2026-08', 'installed'), diyClass: 'licensed', requiredLicense: '電気工事士',
    steps: ['必要な場所と数を図面に落とす', '電気工事士に依頼する'] },
  { id: 'circuit', category: '電気', name: '専用回路の増設', unit: '箇所', materialUnitPrice: V(15000, 30000, '専用回路の新設 15,000〜25,000円前後（電気工事事業者の公表相場）', '2026-08', 'installed'), diyClass: 'licensed', requiredLicense: '電気工事士',
    steps: ['大容量機器(IH・エアコン・電子レンジ)の位置を決める', '分電盤の空きを確認してもらう', '電気工事士に依頼する'] },
  { id: 'lighting_diy', category: '電気', name: '照明器具の取付(引掛シーリング)', unit: '箇所', materialUnitPrice: V(2800, 20000, 'LEDシーリングライト6畳用が2,780円〜4,000円（ニトリ・通販各社）。デザイン照明やペンダントで2万円前後まで。引掛シーリングに挿すだけなら電気工事士は不要', '2026-08', 'equipment'), diyClass: 'diy',
    steps: ['引掛シーリングが付いているか確認する', '器具を選んで取り付ける'] },
  { id: 'switch', category: '電気', name: 'スイッチ交換', unit: '箇所', materialUnitPrice: P(1000, 3000, 'installed'), diyClass: 'licensed', requiredLicense: '電気工事士',
    steps: ['電気工事士に依頼する(配線に触る作業のため)'] },
  // 断熱
  { id: 'insulate-floor', category: '断熱', name: '床下断熱材の充填', unit: '㎡', materialUnitPrice: V(1500, 4000, '押出法ポリスチレン30mm 14,839円/6枚(910×1820)＝1,493円/㎡', '2026-08'), diyClass: 'diy_hard',
    steps: ['床下に入れるか点検口を確認する', '大引間に断熱材をはめる', '受け材で落下を防ぐ'] },
  { id: 'insulate-ceiling', category: '断熱', name: '天井断熱材の敷き込み', unit: '㎡', materialUnitPrice: P(1500, 3500), diyClass: 'diy_hard',
    steps: ['小屋裏に上がれるか確認する', '配線を潰さないように敷く', '防じんマスク必須'] },
  // 外部
  { id: 'gaiheki-paint', category: '外部', name: '外壁塗装', unit: '㎡', materialUnitPrice: P(1500, 4000), diyClass: 'diy_hard',
    steps: ['高所は足場が必要(足場は専門業者)', '洗浄・下地処理する', '下塗り+上塗り2回'],
    marketNote: '足場代が大きい。高所作業は無理をしない' },
  { id: 'yane-hoshu', category: '外部', name: '屋根の補修', unit: '式', materialUnitPrice: P(50000, 500000, 'installed'), diyClass: 'pro_recommended',
    steps: ['地上・小屋裏から雨漏り箇所を推定する', '屋根業者に調査を依頼する'],
    marketNote: '高所のため原則プロへ。応急処置もプロと相談' },
  { id: 'amadoi', category: '外部', name: '雨樋の交換', unit: 'm', materialUnitPrice: P(1500, 4000), diyClass: 'diy_hard',
    steps: ['勾配を確認する', '金具を付け替える', '高所は足場・脚立の安全確保を最優先に'] },
  // 設備
  { id: 'kanki', category: '設備', name: '換気扇の設置・交換', unit: '箇所', materialUnitPrice: P(10000, 50000, 'equipment'), diyClass: 'pro_recommended',
    permitNote: '新規の電源工事は電気工事士',
    steps: ['換気経路を決める', '外壁開口が必要なら専門業者に依頼する'] },
  { id: 'aircon', category: '設備', name: 'エアコン設置', unit: '箇所', materialUnitPrice: P(80000, 250000, 'installed'), diyClass: 'pro_recommended',
    steps: ['部屋の広さから容量を選ぶ', '専用回路の有無を確認する', '設置業者に依頼する'] },
  // その他
  { id: 'shiroari', category: 'その他', name: 'シロアリ防除', unit: '㎡', materialUnitPrice: P(1500, 3500, 'installed'), diyClass: 'pro_recommended',
    steps: ['床下調査を依頼する', '被害があれば駆除+予防処理する'] },
  { id: 'cleaning', category: 'その他', name: 'ハウスクリーニング', unit: '式', materialUnitPrice: P(30000, 150000, 'service'), diyClass: 'diy',
    steps: ['自分たちでやる範囲と頼む範囲を分ける', '水回りだけプロに頼むのも手'] },
];

export const WORK_ITEM_BY_ID = new Map(WORK_ITEMS.map((w) => [w.id, w] as const));

export const DIY_CLASS_LABEL: Record<DiyClass, string> = {
  diy: 'DIYできる',
  diy_hard: 'DIY可(難しめ)',
  licensed: '有資格者のみ',
  pro_recommended: 'プロ推奨',
  permit_related: '許可・届出関連',
};
