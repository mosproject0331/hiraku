import type { RegionPack } from '../../index';

/**
 * 三田地域パック(プレースホルダ)。
 * 内容はすべて「例:」のダミー。実データ投入は人間TODO(§14)。
 */
export const sandaPack: RegionPack = {
  id: 'sanda',
  name: '兵庫県三田市(プレースホルダ)',
  municipality: '兵庫県三田市',
  ordinances: [
    {
      title: '例: 住宅宿泊事業の上乗せ条例の有無',
      summary: '例: 実施制限区域・期間の有無を市の担当窓口で確認する(ダミー。実データは要調査)',
      verified: false,
    },
  ],
  subsidies: [
    {
      title: '例: 空き家活用支援の補助制度',
      summary: '例: 改修費補助の対象要件・上限額・募集期間を確認する(ダミー。実データは要調査)',
      verified: false,
    },
    {
      title: '例: 耐震診断・改修の補助',
      summary: '例: 旧耐震の木造住宅を対象とした診断補助の有無(ダミー。実データは要調査)',
      verified: false,
    },
  ],
  contacts: [
    {
      title: '例: 都市計画の窓口',
      summary: '例: 用途地域・区域区分の確認先(ダミー。課名・電話番号は要調査)',
      verified: false,
    },
  ],
  localKnowledge: [
    {
      title: '例: 地域の空き家バンクの状況',
      summary: '例: 登録数・更新頻度・掲載までの流れ(ダミー。実データは要調査)',
      verified: false,
    },
  ],
};
