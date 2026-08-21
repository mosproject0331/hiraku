/** 13用途地域 + 指定なし */
export type YoutoChiiki =
  | 'dai1_teiso'
  | 'dai2_teiso'
  | 'dai1_chuko'
  | 'dai2_chuko'
  | 'dai1_jukyo'
  | 'dai2_jukyo'
  | 'junjukyo'
  | 'denen'
  | 'kinrin'
  | 'shogyo'
  | 'junkogyo'
  | 'kogyo'
  | 'kogyo_senyo'
  | 'shitei_nashi';

/** やりたい用途(UI上は「宿」1枚でサブ選択し8種に見せる) */
export type DesiredUse =
  | 'cafe'
  | 'minpaku'
  | 'kani_shukuhaku'
  | 'sharehouse'
  | 'atelier'
  | 'retail'
  | 'coworking'
  | 'library'
  | 'home_plus';

export type Verdict = 'ok' | 'conditional' | 'hard' | 'ng' | 'unknown';

export const VERDICT_LABEL: Record<Verdict, string> = {
  ok: '可能性が高い',
  conditional: '条件付き',
  hard: 'ハードルあり',
  ng: '難しい',
  unknown: '情報不足',
};

export const VERDICT_MARK: Record<Verdict, string> = {
  ok: '◎',
  conditional: '○',
  hard: '△',
  ng: '×',
  unknown: '?',
};

export type ConfirmDesk =
  | '都市計画課'
  | '建築指導課'
  | '保健所'
  | '消防署(予防課)'
  | '農業委員会'
  | '上下水道'
  | '文化財担当'
  | '建築士';

export type RuleCategory =
  | '用途地域'
  | '区域区分'
  | '接道'
  | '建築手続き'
  | '宿泊'
  | '飲食'
  | '建築基準'
  | '消防'
  | '農地'
  | '排水'
  | '耐震'
  | '文化財'
  | '工事資格';

export interface DiagnosisInput {
  address?: string;
  lat?: number;
  lng?: number;
  youtoChiiki: YoutoChiiki | 'unknown';
  kuikiKubun: 'shigaika' | 'chosei' | 'hisenbiki' | 'kuikigai' | 'unknown';
  bokaChiiki: 'boka' | 'junboka' | 'none' | 'unknown';
  setsudo: { roadWidthM?: number; frontageM?: number; flag: 'ok' | 'hatazao' | 'none' | 'unknown' };
  floorAreaM2?: number;
  floors?: number;
  builtYear?: number;
  kensazumi: 'yes' | 'no' | 'unknown';
  currentUse: 'jutaku' | 'tenpo' | 'other' | 'unknown';
  desiredUse: DesiredUse;
  landCategory: 'takuchi' | 'ta' | 'hatake' | 'other' | 'unknown';
  haisui: 'gesui' | 'jokaso' | 'kumitori' | 'unknown';
}

export interface RuleFinding {
  verdict: Verdict;
  summary: string;
  detail: string;
  confirmWith: ConfirmDesk[];
  questions: string[];
}

export interface Rule {
  id: string;
  title: string;
  category: RuleCategory;
  appliesTo(input: DiagnosisInput): boolean;
  evaluate(input: DiagnosisInput): RuleFinding;
}

export interface DiagnosisReport {
  findings: (RuleFinding & { id: string; title: string; category: RuleCategory })[];
  counts: Record<Verdict, number>;
  unknowns: string[];
  nextActions: string[];
  generatedAt: string;
}
