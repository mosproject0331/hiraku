import { RULES } from './rules/all';
import type { DesiredUse, DiagnosisInput, DiagnosisReport, Verdict } from './types';
import {
  COMMON_VIEWING,
  SEARCH_GUIDE,
  USE_CONDITIONS,
  USE_VIEWING,
  type ChecklistItem,
} from './data/viewing-checklist';
import { USE_LABEL, ZONE_LABEL, zonesForUse } from './data/zoning-matrix';

export * from './types';
export { RULES } from './rules/all';
export { USE_LABEL, ZONE_LABEL, zonesForUse, zoningVerdict } from './data/zoning-matrix';
export {
  COMMON_VIEWING,
  SEARCH_GUIDE,
  USE_CONDITIONS,
  USE_VIEWING,
} from './data/viewing-checklist';
export type { ChecklistItem } from './data/viewing-checklist';

/** 入力のうち unknown だったものの日本語ラベル */
function collectUnknowns(input: DiagnosisInput): string[] {
  const u: string[] = [];
  if (input.youtoChiiki === 'unknown') u.push('用途地域');
  if (input.kuikiKubun === 'unknown') u.push('区域区分(市街化/調整など)');
  if (input.bokaChiiki === 'unknown') u.push('防火・準防火地域');
  if (input.setsudo.flag === 'unknown') u.push('接道の状況');
  if (input.floorAreaM2 == null) u.push('延床面積');
  if (input.builtYear == null) u.push('建築年');
  if (input.kensazumi === 'unknown') u.push('検査済証の有無');
  if (input.currentUse === 'unknown') u.push('現在の用途');
  if (input.landCategory === 'unknown') u.push('地目');
  if (input.haisui === 'unknown') u.push('排水の方式');
  return u;
}

const VERDICT_ORDER: Verdict[] = ['ng', 'hard', 'conditional', 'unknown', 'ok'];

export function runDiagnosis(input: DiagnosisInput): DiagnosisReport {
  const findings = RULES.filter((r) => r.appliesTo(input)).map((r) => ({
    id: r.id,
    title: r.title,
    category: r.category,
    ...r.evaluate(input),
  }));
  findings.sort((a, b) => VERDICT_ORDER.indexOf(a.verdict) - VERDICT_ORDER.indexOf(b.verdict));

  const counts: Record<Verdict, number> = { ok: 0, conditional: 0, hard: 0, ng: 0, unknown: 0 };
  for (const f of findings) counts[f.verdict] += 1;

  const unknowns = collectUnknowns(input);

  // 次のアクション3つ: 重い順の判定から確認先をたどる
  const nextActions: string[] = [];
  if (input.youtoChiiki === 'unknown') {
    nextActions.push('都市計画課(または都市計画情報マップ)で用途地域・区域区分・防火指定を確認する');
  }
  for (const f of findings) {
    if (nextActions.length >= 3) break;
    if (f.verdict === 'ng' || f.verdict === 'hard') {
      const desk = f.confirmWith[0];
      if (desk) {
        const a = `${desk}に「${f.title}」について相談する(質問文テンプレあり)`;
        if (!nextActions.includes(a)) nextActions.push(a);
      }
    }
  }
  if (nextActions.length < 3) {
    for (const f of findings) {
      if (nextActions.length >= 3) break;
      if (f.verdict === 'conditional') {
        const desk = f.confirmWith[0];
        if (desk) {
          const a = `${desk}に「${f.title}」について事前相談する`;
          if (!nextActions.includes(a)) nextActions.push(a);
        }
      }
    }
  }

  return {
    findings,
    counts,
    unknowns,
    nextActions: nextActions.slice(0, 3),
    generatedAt: new Date().toISOString(),
  };
}

export interface ModeAResult {
  useLabel: string;
  conditions: string[];
  zones: ReturnType<typeof zonesForUse>;
  viewing: { common: ChecklistItem[]; byUse: ChecklistItem[] };
  searchGuide: string[];
}

/** モードA: 用途からの逆引き */
export function reverseLookup(use: DesiredUse): ModeAResult {
  return {
    useLabel: USE_LABEL[use],
    conditions: USE_CONDITIONS[use],
    zones: zonesForUse(use),
    viewing: { common: COMMON_VIEWING, byUse: USE_VIEWING[use] },
    searchGuide: SEARCH_GUIDE,
  };
}

/** 用途地域の自動判定(将来のオープンデータ連携用の口だけ定義) */
export interface ZoningProvider {
  lookup(lat: number, lng: number): Promise<DiagnosisInput['youtoChiiki']>;
}

export class ManualZoningProvider implements ZoningProvider {
  async lookup(): Promise<DiagnosisInput['youtoChiiki']> {
    return 'unknown';
  }
}
