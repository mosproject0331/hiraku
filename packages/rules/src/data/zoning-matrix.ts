import type { DesiredUse, Verdict, YoutoChiiki } from '../types';

export const ZONE_LABEL: Record<YoutoChiiki, string> = {
  dai1_teiso: '第一種低層住居専用地域',
  dai2_teiso: '第二種低層住居専用地域',
  dai1_chuko: '第一種中高層住居専用地域',
  dai2_chuko: '第二種中高層住居専用地域',
  dai1_jukyo: '第一種住居地域',
  dai2_jukyo: '第二種住居地域',
  junjukyo: '準住居地域',
  denen: '田園住居地域',
  kinrin: '近隣商業地域',
  shogyo: '商業地域',
  junkogyo: '準工業地域',
  kogyo: '工業地域',
  kogyo_senyo: '工業専用地域',
  shitei_nashi: '用途地域の指定なし',
};

export const USE_LABEL: Record<DesiredUse, string> = {
  cafe: 'カフェ・飲食店',
  minpaku: '宿(住宅宿泊事業=民泊)',
  kani_shukuhaku: '宿(簡易宿所)',
  sharehouse: 'シェアハウス',
  atelier: 'アトリエ・工房',
  retail: '物販店',
  coworking: 'コワーキング・事務所',
  library: '私設図書館',
  home_plus: '住まい+α(兼用住宅)',
};

/**
 * 13用途地域×用途の適否マトリクス(建築基準法の用途制限の考え方に基づく簡略表)。
 * あくまで「可能性」の目安。規模・階数・条例により変わるため、詳細は都市計画課で確認する前提。
 */
type Zone = Exclude<YoutoChiiki, 'shitei_nashi'>;
const ZONES: Zone[] = [
  'dai1_teiso', 'dai2_teiso', 'dai1_chuko', 'dai2_chuko', 'dai1_jukyo',
  'dai2_jukyo', 'junjukyo', 'denen', 'kinrin', 'shogyo', 'junkogyo', 'kogyo', 'kogyo_senyo',
];

// 行 = 用途、列 = ZONES の順
const T: Record<DesiredUse, Verdict[]> = {
  //             一低       二低       一中高     二中高     一住       二住       準住       田園       近商       商業       準工       工業       工専
  cafe:          ['ng', 'conditional', 'conditional', 'conditional', 'conditional', 'ok', 'ok', 'conditional', 'ok', 'ok', 'ok', 'ok', 'ng'],
  minpaku:       ['ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ng'],
  kani_shukuhaku:['ng', 'ng', 'ng', 'ng', 'conditional', 'ok', 'ok', 'ng', 'ok', 'ok', 'ok', 'ng', 'ng'],
  sharehouse:    ['ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ng'],
  atelier:       ['hard', 'hard', 'conditional', 'conditional', 'conditional', 'conditional', 'ok', 'conditional', 'ok', 'ok', 'ok', 'ok', 'ok'],
  retail:        ['ng', 'conditional', 'conditional', 'conditional', 'conditional', 'ok', 'ok', 'conditional', 'ok', 'ok', 'ok', 'ok', 'ng'],
  coworking:     ['ng', 'ng', 'hard', 'conditional', 'conditional', 'ok', 'ok', 'ng', 'ok', 'ok', 'ok', 'ok', 'conditional'],
  library:       ['ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ng'],
  home_plus:     ['conditional', 'conditional', 'conditional', 'conditional', 'ok', 'ok', 'ok', 'conditional', 'ok', 'ok', 'ok', 'ok', 'ng'],
};

export function zoningVerdict(use: DesiredUse, zone: YoutoChiiki): Verdict {
  if (zone === 'shitei_nashi') return 'conditional';
  const idx = ZONES.indexOf(zone);
  return T[use][idx] ?? 'unknown';
}

/** モードA逆引き: この用途に向く用途地域の一覧 */
export function zonesForUse(use: DesiredUse): { zone: YoutoChiiki; verdict: Verdict }[] {
  return ZONES.map((zone) => ({ zone, verdict: zoningVerdict(use, zone) }));
}
