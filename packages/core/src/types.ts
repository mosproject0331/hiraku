import type { Site } from './geo';

export type Confidence = 'estimated' | 'hypothesis' | 'measured';

export interface Node {
  id: string;
  x: number;
  y: number;
  confidence: Confidence;
}

export interface Wall {
  id: string;
  a: string;
  b: string;
  thickness: number; // default 120
  confidence: Confidence;
  structural: 'unknown' | 'suspected' | 'cleared_by_expert';
}

export interface Opening {
  id: string;
  wallId: string;
  offset: number;
  width: number;
  height: number;
  sillHeight: number;
  kind: 'door' | 'window' | 'entrance' | 'other';
  confidence: Confidence;
}

export interface Room {
  id: string;
  name: string;
  wallLoop: string[];
  areaM2: number;
  tatami: number;
}

export interface NameHint {
  x: number;
  y: number;
  name: string;
}

/** 図面の下絵（動画のコマ・間取り図の写真など）。図面座標系(mm)に配置する */
export interface Backdrop {
  /** 画像URL（/api/media/... または data:） */
  src: string;
  /** 画像左上の位置（図面座標, mm） */
  x: number;
  y: number;
  /** 画像1ピクセルあたりの実寸(mm)。実寸合わせで決まる */
  mmPerPx: number;
  /** 表示の不透明度 0–1 */
  opacity: number;
  /** 回転（度）。画像左上を中心に回す */
  rotation: number;
  /** 元画像のピクセル寸法（表示サイズの計算に使う） */
  pxWidth: number;
  pxHeight: number;
}

export interface Level {
  id: string;
  name: string;
  heightMm: number;
  walls: Wall[];
  nodes: Node[];
  openings: Opening[];
  rooms: Room[];
  /** 拡張: サンプル・recon出力が部屋名の位置ヒントを運ぶ(ASSUMPTIONS参照) */
  nameHints?: NameHint[];
  /** 拡張: なぞるための下絵 */
  backdrop?: Backdrop;
}

export interface SpaceModel {
  id: string;
  levels: Level[];
  moduleMm: number; // 既定910
  scaleFactor: number;
  version: number;
}

export interface Measurement {
  id: string;
  type: 'wallLength' | 'diagonal' | 'ceilingHeight' | 'openingWidth' | 'tilt';
  targetIds: string[];
  valueMm: number;
  note?: string;
  createdAt: string;
}

export interface DamagePin {
  id: string;
  levelId: string;
  x: number;
  y: number;
  category: '雨漏り' | '腐朽' | '蟻害' | '傾き' | '設備' | 'その他';
  photoRef?: string;
  memo: string;
}

export interface Property {
  address?: string;
  lat?: number;
  lng?: number;
  landCategory?: string;
  builtYear?: number;
  notes: string;
}

export interface XYPoint {
  x: number;
  y: number;
}

export type RenovationOp =
  | { op: 'remove_partition'; wallId: string }
  | { op: 'add_partition'; a: XYPoint; b: XYPoint }
  | {
      op: 'add_opening';
      wallId: string;
      offset: number;
      width: number;
      height: number;
      sillHeight: number;
      kind: Opening['kind'];
    }
  | { op: 'close_opening'; openingId: string }
  | { op: 'change_floor' | 'change_wall_finish' | 'change_ceiling'; roomId: string; finishId: string }
  | { op: 'add_water_unit'; roomId: string; unit: 'kitchen' | 'toilet' | 'bath' | 'sink'; routeNote: string }
  | { op: 'insulate'; target: 'floor' | 'ceiling' | 'window_inner'; roomId?: string }
  | { op: 'electrical'; work: 'add_outlet' | 'add_circuit' | 'lighting_diy'; count: number; roomId?: string };

export interface RenovationPlan {
  id: string;
  name: string;
  intent: string;
  ops: RenovationOp[];
  createdAt: string;
}

/** 内見・現地確認の一件ごとの結果 */
export type CheckState = 'ok' | 'watch' | 'bad';

export interface CheckEntry {
  state: CheckState;
  memo: string;
  /** 写真のID。実体は端末の IndexedDB に置く */
  photos: string[];
  /** 記録した時刻(ISO) */
  at: string;
}

/** 現場で足した独自のチェック項目 */
export interface CustomCheck {
  id: string;
  label: string;
}

export interface Project {
  id: string;
  name: string;
  property: Property;
  model?: SpaceModel;
  measurements: Measurement[];
  damagePins: DamagePin[];
  /** 型は packages/rules 側。coreは循環依存を避け unknown で保持(ASSUMPTIONS参照) */
  diagnosis?: { input: unknown; report?: unknown };
  plans: RenovationPlan[];
  regionPackId?: string;
  /** 拡張: 現況報告書の所見(ASSUMPTIONS参照) */
  surveyNotes?: string;
  /** 拡張: 確認事項ToDoのチェック状態 */
  todoDone?: Record<string, boolean>;
  /** 拡張: 内見チェックの結果。キーは項目のラベル */
  checklist?: Record<string, CheckEntry>;
  /** 拡張: 現場で足したチェック項目 */
  customChecks?: CustomCheck[];
  /** 拡張: 御見積書。型は packages/report 側なので unknown で預かる */
  quote?: unknown;
  /** 拡張: 敷地。どこに、どの向きで建っているか */
  site?: Site;
  createdAt: string;
  updatedAt: string;
}

/** 永続化の口(§3-2)。当面はローカルJSONファイル実装。将来Cloudflare D1に差し替え */
export interface Repository {
  list(): Promise<{ id: string; name: string; updatedAt: string }[]>;
  get(id: string): Promise<Project | null>;
  save(project: Project): Promise<void>;
  remove(id: string): Promise<void>;
}
