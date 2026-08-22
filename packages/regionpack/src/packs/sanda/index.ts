import type { RegionPack } from '../../index';

/**
 * 三田地域パック。
 * 2026-08-22 時点で三田市・兵庫県の公式ページから確認した内容にもとづく。
 * ただし制度は毎年変わるため、すべて verified:false（要・窓口確認）のまま扱う。
 */
export const sandaPack: RegionPack = {
  id: 'sanda',
  name: '兵庫県三田市',
  municipality: '兵庫県三田市',

  ordinances: [
    {
      title: '用途地域・地区計画は地図情報で調べられます',
      summary:
        '三田市は都市計画情報をWeb地図で公開しています。住所から用途地域・地区計画・景観計画の指定を確認できます。画面の内容を印刷して窓口に持っていくと話が早く進みます。',
      url: 'https://webgis.alandis.jp/sanda28/webgis/',
      verified: false,
    },
    {
      title: '市街化調整区域が広い市です',
      summary:
        '三田市は市街化調整区域が市域の大部分を占めます。空き家が調整区域内にある場合、用途変更に許可の論点が出ます。既存建築物の活用可否は市の審査基準次第なので、物件を決める前に都市政策課へ相談してください。',
      url: 'https://www.city.sanda.lg.jp/soshiki/34/gyomu/seisaku_keikaku/toshi_keikaku/index.html',
      verified: false,
    },
    {
      title: '住宅宿泊事業（民泊）の上乗せ規制は県の窓口で確認',
      summary:
        '兵庫県の住宅宿泊事業に関する条例で、区域や期間の制限がかかる場合があります。三田市域の届出・相談先は宝塚健康福祉事務所です。',
      verified: false,
    },
  ],

  subsidies: [
    {
      title: '空き家リフォーム補助事業（上限100万円／地域交流拠点型は200万円）',
      summary:
        '対象経費の2分の1を補助。戸建の場合、若年・子育て世帯居住型とUJIターン居住型は上限100万円、区・自治会・まちづくり協議会による地域交流拠点型は上限200万円（共同住宅はそれぞれ65万円・130万円）。対象になる空き家は「市街化区域内」「6か月以上空き家」「築20年以上」「水回り設備が10年以上未更新」。工事費100万円以上が条件で、完了後10年以上の居住・活用が求められます。申請期間があるので年度初めに確認を。',
      url: 'https://www.city.sanda.lg.jp/soshiki/34/gyomu/sumai/3/620.html',
      verified: false,
    },
    {
      title: '空き家バンク登録促進補助事業（上限10万円）',
      summary:
        '空き家バンクに2年以上継続して登録する所有者向け。登記手続き費用と、家財処分費用（クリーンセンター持込・粗大ごみ手数料、一般廃棄物業者への委託、家電リサイクル対象品の処分、清掃・除草の委託）の合計の2分の1、上限10万円。残置物の片付けが重い物件では効きます。',
      url: 'https://www.city.sanda.lg.jp/soshiki/34/gyomu/sumai/3/akiya/4275.html',
      verified: false,
    },
    {
      title: '空き家バンク経由なら譲渡所得の特別控除が使える場合があります',
      summary:
        '相続した空き家を売る場合、条件を満たせば譲渡所得から3,000万円の特別控除を受けられる制度があります。要件が細かいので、税務署または税理士に必ず確認してください。',
      url: 'https://www.city.sanda.lg.jp/soshiki/34/gyomu/sumai/3/akiya/4228.html',
      verified: false,
    },
  ],

  contacts: [
    {
      title: '都市政策課（用途地域・都市計画・空き家）',
      summary:
        '用途地域、区域区分、地区計画、空き家バンク、空き家関係の補助金の窓口。三田市三輪2丁目1番1号。',
      tel: '079-559-5118',
      url: 'https://www.city.sanda.lg.jp/kurashi/sumai/3/akiya/index.html',
      verified: false,
    },
    {
      title: '三田市空き家バンク（専用ダイヤル）',
      summary: '空き家バンクの登録・利用に関する専用の連絡先。',
      tel: '079-559-5128',
      url: 'https://www.city.sanda.lg.jp/soshiki/34/gyomu/sumai/3/akiya/4228.html',
      verified: false,
    },
    {
      title: '宝塚健康福祉事務所（保健所）',
      summary:
        '三田市は宝塚健康福祉事務所の管轄です。飲食店営業許可、旅館業、住宅宿泊事業の相談・申請先。図面の段階で事前相談すると手戻りが減ります。',
      tel: '0797-62-7314',
      verified: false,
    },
    {
      title: '三田市消防本部 予防課',
      summary:
        '消防用設備、防火対象物の届出。飲食・宿泊・物販など人が集まる用途では、着工前の相談が実質必須です。',
      verified: false,
    },
    {
      title: '三田市農業委員会',
      summary: '敷地に田・畑が含まれる場合の農地転用（農地法3条・4条・5条）の相談先。',
      verified: false,
    },
  ],

  localKnowledge: [
    {
      title: '調整区域の物件が多い',
      summary:
        '三田市は市街化調整区域の面積が広く、空き家バンクの物件も調整区域内のものが少なくありません。用途変更のハードルと補助金の対象要件（リフォーム補助は市街化区域内が条件）の両方に効くため、物件を見る前に区域区分を確認する習慣をつけると無駄足が減ります。',
      verified: false,
    },
    {
      title: '補助金の「対象は市街化区域内」と「活用したい空き家は調整区域」がぶつかりやすい',
      summary:
        '空き家リフォーム補助は市街化区域内の空き家が対象です。調整区域の物件を選ぶ場合は、この補助を当てにしない資金計画が必要になります。',
      verified: false,
    },
    {
      title: '地域交流拠点型という枠がある',
      summary:
        '区・自治会・まちづくり協議会が主体なら、リフォーム補助の上限が戸建200万円に上がります。個人で始めるより、地域組織と組む形の方が制度に乗りやすい場合があります。',
      verified: false,
    },
  ],
};
