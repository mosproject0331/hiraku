import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  addRectangle,
  alignWall,
  calibrateBackdrop,
  deserialize,
  detectRooms,
  extendWall,
  mergeNearbyNodes,
  moveNode,
  orthogonalize,
  serialize,
  setWallLength,
  solveConstraints,
  type Backdrop,
  type CheckEntry,
  type CheckState,
  type CustomCheck,
  type DamagePin,
  type Measurement,
  type Opening,
  type Project,
  type RenovationPlan,
  type Site,
  type SpaceModel,
} from '@hiraku/core';
import type { DesiredUse, DiagnosisInput, DiagnosisReport, Verdict } from '@hiraku/rules';
import type { HearingPlan } from '@hiraku/llm';
import type { PriceBook } from '@hiraku/estimate';
import type { QuoteDoc } from '@hiraku/report';
import {
  applyAnswer,
  buildProposals,
  opsOf,
  QUESTIONS,
  type Answer,
  type HearingProfile,
  type Proposal,
  type SiteFacts,
} from '@hiraku/proposal';

export type Tool = 'select' | 'wall' | 'numeric' | 'opening' | 'delete' | 'pin' | 'backdrop' | 'calibrate';
export type Selected = { kind: 'node' | 'wall' | 'opening' | 'pin'; id: string } | null;

export function emptyModel(): SpaceModel {
  return {
    id: 'untitled',
    levels: [
      { id: 'L1', name: '1階', heightMm: 2400, walls: [], nodes: [], openings: [], rooms: [] },
    ],
    moduleMm: 910,
    scaleFactor: 1,
    version: 1,
  };
}

function refreshRooms(m: SpaceModel): void {
  for (const lv of m.levels) lv.rooms = detectRooms(lv);
}

/** 内見・劣化ピン・診断から、建物側の条件を集める */
function collectSiteFacts(s: EditorState): SiteFacts {
  const troubles = [
    ...s.damagePins.map((p) => ({
      category: p.category,
      where: `図面のピン(${Math.round(p.x / 100) / 10}, ${Math.round(p.y / 100) / 10}m)`,
      memo: p.memo,
      severity: 'bad' as const,
    })),
    ...Object.entries(s.checklist)
      .filter(([, e]) => e.state !== 'ok')
      .map(([label, e]) => ({
        category: label,
        where: '内見チェック',
        memo: e.memo,
        severity: e.state as 'watch' | 'bad',
      })),
  ];
  const report = s.lastDiagnosis?.report;
  // いちばん厳しい判定を、その物件の当たりとして持つ
  const order: Verdict[] = ['ng', 'hard', 'conditional', 'unknown', 'ok'];
  const verdict = report ? order.find((v) => (report.counts[v] ?? 0) > 0) : undefined;
  return {
    troubles,
    permits: report?.nextActions ?? [],
    verdict: report ? (report.unknowns.length ? 'unknown' : verdict) : undefined,
    floorAreaM2: s.lastDiagnosis?.input.floorAreaM2 ?? undefined,
  };
}

/** 作図の結果を、履歴を積んで反映する */
function commit(
  get: () => EditorState,
  set: (partial: Partial<EditorState>) => void,
  next: SpaceModel,
  extra: Partial<EditorState> = {},
): void {
  const { model, history } = get();
  const m = structuredClone(next);
  refreshRooms(m);
  set({ model: m, history: [...history.slice(-49), serialize(model)], future: [], ...extra });
}

interface EditorState {
  model: SpaceModel;
  measurements: Measurement[];
  damagePins: DamagePin[];
  surveyNotes: string;
  pinCategory: DamagePin['category'];
  /** 実寸合わせの1点目（図面座標mm）。2点目のクリックで確定 */
  calibA: { x: number; y: number } | null;
  projectId: string | null;
  projectName: string;
  regionPackId: string | undefined;
  lastDiagnosis: { input: DiagnosisInput; report: DiagnosisReport } | null;
  lastPlans: HearingPlan[] | null;
  todoDone: Record<string, boolean>;
  /** 内見チェックの結果。キーは項目のラベル */
  checklist: Record<string, CheckEntry>;
  /** 現場で足したチェック項目 */
  customChecks: CustomCheck[];
  /** 内見チェックで使う用途。診断より先に見に行くこともあるので単独で持つ */
  checkUse: DesiredUse | null;
  /** 御見積書。案件ごとに1通を持ち回る */
  quote: QuoteDoc | null;
  /** 敷地。どこに、どの向きで建っているか */
  site: Site | null;
  /** ヒアリングで集めた、その人の側の条件 */
  hearing: HearingProfile;
  /** 組み上がった改修案 */
  proposals: Proposal[];
  priceBook: PriceBook;
  tool: Tool;
  openingKind: Opening['kind'];
  selected: Selected;
  pendingNodeId: string | null;
  history: string[];
  future: string[];
  setTool: (t: Tool) => void;
  setOpeningKind: (k: Opening['kind']) => void;
  select: (s: Selected) => void;
  setPending: (id: string | null) => void;
  /** モデルを変更する。skipHistory時はundo履歴を積まない(ドラッグ中の逐次更新用) */
  mutate: (fn: (m: SpaceModel) => void, opts?: { skipHistory?: boolean }) => void;
  checkpoint: () => void;
  loadModel: (m: SpaceModel) => void;
  undo: () => void;
  redo: () => void;
  setPinCategory: (c: DamagePin['category']) => void;
  setSurveyNotes: (s: string) => void;
  addMeasurement: (m: Omit<Measurement, 'id' | 'createdAt'>) => void;
  removeMeasurement: (id: string) => void;
  addPin: (x: number, y: number) => string;
  updatePin: (id: string, patch: Partial<DamagePin>) => void;
  removePin: (id: string) => void;
  setBackdrop: (b: Backdrop | undefined) => void;
  patchBackdrop: (patch: Partial<Backdrop>) => void;
  setCalibA: (p: { x: number; y: number } | null) => void;
  applyCalibration: (p2: { x: number; y: number }, realMm: number) => void;
  setProjectName: (s: string) => void;
  setRegionPackId: (s: string | undefined) => void;
  setDiagnosis: (input: DiagnosisInput, report: DiagnosisReport) => void;
  setPlans: (p: HearingPlan[]) => void;
  toggleTodo: (key: string) => void;
  setCheck: (label: string, state: CheckState | null) => void;
  setCheckMemo: (label: string, memo: string) => void;
  addCheckPhoto: (label: string, photoId: string) => void;
  removeCheckPhoto: (label: string, photoId: string) => void;
  addCustomCheck: (label: string) => void;
  removeCustomCheck: (id: string) => void;
  clearChecklist: () => void;
  setCheckUse: (u: DesiredUse | null) => void;
  setQuote: (q: QuoteDoc | null) => void;
  patchQuote: (p: Partial<QuoteDoc>) => void;
  setSite: (s: Site | null) => void;
  /** ヒアリングの答えを1つ入れる */
  answerHearing: (questionId: string, raw: Answer) => void;
  /** ヒアリングをやり直す */
  resetHearing: () => void;
  /** いまの図面・内見・診断から改修案を組み直す */
  makeProposals: () => void;
  /** 起点から、長さと向き(度)を打ち込んで壁をのばす */
  drawExtend: (lengthMm: number, headingDeg: number) => void;
  /** 起点から、幅×奥行の長方形を置く */
  drawRect: (widthMm: number, depthMm: number) => void;
  /** 選んだ壁の長さを打ち込んだ値にする */
  drawSetWallLength: (wallId: string, lengthMm: number, anchor: 'a' | 'b' | 'center') => void;
  /** 選んだ壁を水平・垂直にそろえる */
  drawAlignWall: (wallId: string, axis: 'h' | 'v' | 'auto') => void;
  /** 図面全体を直角にそろえる */
  drawOrthogonalize: () => void;
  /** 近すぎる頂点をひとつにまとめる */
  drawMergeNodes: () => void;
  /** 頂点を座標で置き直す */
  drawMoveNode: (nodeId: string, x: number, y: number) => void;
  setPriceBook: (b: PriceBook) => void;
  toProject: () => Project;
  hydrateProject: (p: Project) => void;
}

export const useEditor = create<EditorState>()(
  persist(
    (set, get) => ({
  model: (() => {
    const m = emptyModel();
    refreshRooms(m);
    return m;
  })(),
  tool: 'select',
  openingKind: 'door',
  measurements: [],
  damagePins: [],
  surveyNotes: '',
  pinCategory: '雨漏り',
  calibA: null,
  projectId: null,
  projectName: '',
  regionPackId: undefined,
  lastDiagnosis: null,
  lastPlans: null,
  todoDone: {},
  checklist: {},
  customChecks: [],
  checkUse: null,
  quote: null,
  site: null,
  hearing: {},
  proposals: [],
  priceBook: {},
  selected: null,
  pendingNodeId: null,
  history: [],
  future: [],
  setTool: (tool) => set({ tool, pendingNodeId: null, selected: null }),
  setOpeningKind: (openingKind) => set({ openingKind }),
  select: (selected) => set({ selected }),
  setPending: (pendingNodeId) => set({ pendingNodeId }),
  mutate: (fn, opts) => {
    const { model, history } = get();
    const next = structuredClone(model);
    fn(next);
    refreshRooms(next);
    if (opts?.skipHistory) {
      set({ model: next });
    } else {
      set({ model: next, history: [...history.slice(-49), serialize(model)], future: [] });
    }
  },
  checkpoint: () => {
    const { model, history } = get();
    set({ history: [...history.slice(-49), serialize(model)], future: [] });
  },
  loadModel: (m) => {
    const next = structuredClone(m);
    refreshRooms(next);
    set({ model: next, history: [], future: [], selected: null, pendingNodeId: null });
  },
  setPinCategory: (pinCategory) => set({ pinCategory }),
  setSurveyNotes: (surveyNotes) => set({ surveyNotes }),
  addMeasurement: (m) => {
    const { model, measurements, history } = get();
    const meas: Measurement = { ...m, id: freshId('m'), createdAt: new Date().toISOString() };
    const all = [...measurements, meas];
    const solved = solveConstraints(model, all);
    set({
      model: solved,
      measurements: all,
      history: [...history.slice(-49), serialize(model)],
      future: [],
    });
  },
  removeMeasurement: (id) => {
    // 幾何は現状のまま残し、一覧からだけ外す(再適用は残りの実測で行う)
    const { model, measurements } = get();
    const rest = measurements.filter((x) => x.id !== id);
    set({ measurements: rest, model: solveConstraints(model, rest) });
  },
  addPin: (x, y) => {
    const { damagePins, pinCategory, model } = get();
    const id = freshId('p');
    const pin = { id, levelId: model.levels[0]!.id, x: Math.round(x), y: Math.round(y), category: pinCategory, memo: '' };
    set({ damagePins: [...damagePins, pin] });
    return id;
  },
  updatePin: (id, patch) => {
    set({ damagePins: get().damagePins.map((p) => (p.id === id ? { ...p, ...patch } : p)) });
  },
  removePin: (id) => {
    set({ damagePins: get().damagePins.filter((p) => p.id !== id), selected: null });
  },
  setBackdrop: (b) => {
    get().mutate((m) => {
      m.levels[0]!.backdrop = b;
    });
  },
  patchBackdrop: (patch) => {
    get().mutate(
      (m) => {
        const b = m.levels[0]!.backdrop;
        if (b) m.levels[0]!.backdrop = { ...b, ...patch };
      },
      { skipHistory: true },
    );
  },
  setCalibA: (calibA) => set({ calibA }),
  applyCalibration: (p2, realMm) => {
    const { calibA } = get();
    if (!calibA) return;
    get().mutate((m) => {
      const b = m.levels[0]!.backdrop;
      if (b) m.levels[0]!.backdrop = calibrateBackdrop(b, calibA, p2, realMm);
    });
    set({ calibA: null });
  },
  setProjectName: (projectName) => set({ projectName }),
  setRegionPackId: (regionPackId) => set({ regionPackId }),
  setDiagnosis: (input, report) => set({ lastDiagnosis: { input, report } }),
  setPlans: (lastPlans) => set({ lastPlans }),
  toggleTodo: (key) => set({ todoDone: { ...get().todoDone, [key]: !get().todoDone[key] } }),
  setCheck: (label, state) => {
    const next = { ...get().checklist };
    if (state === null) delete next[label];
    else {
      const cur = next[label];
      next[label] = {
        state,
        memo: cur?.memo ?? '',
        photos: cur?.photos ?? [],
        at: new Date().toISOString(),
      };
    }
    set({ checklist: next });
  },
  setCheckMemo: (label, memo) => {
    const cur = get().checklist[label];
    set({
      checklist: {
        ...get().checklist,
        [label]: {
          state: cur?.state ?? 'watch',
          memo,
          photos: cur?.photos ?? [],
          at: new Date().toISOString(),
        },
      },
    });
  },
  addCheckPhoto: (label, photoId) => {
    const cur = get().checklist[label];
    set({
      checklist: {
        ...get().checklist,
        [label]: {
          state: cur?.state ?? 'watch',
          memo: cur?.memo ?? '',
          photos: [...(cur?.photos ?? []), photoId],
          at: new Date().toISOString(),
        },
      },
    });
  },
  removeCheckPhoto: (label, photoId) => {
    const cur = get().checklist[label];
    if (!cur) return;
    set({
      checklist: {
        ...get().checklist,
        [label]: { ...cur, photos: cur.photos.filter((p) => p !== photoId) },
      },
    });
  },
  addCustomCheck: (label) => {
    const t = label.trim();
    if (!t) return;
    set({ customChecks: [...get().customChecks, { id: freshId('c'), label: t }] });
  },
  removeCustomCheck: (id) => {
    const item = get().customChecks.find((c) => c.id === id);
    const next = { ...get().checklist };
    if (item) delete next[item.label];
    set({ customChecks: get().customChecks.filter((c) => c.id !== id), checklist: next });
  },
  clearChecklist: () => set({ checklist: {}, customChecks: [] }),
  setCheckUse: (checkUse) => set({ checkUse }),
  setQuote: (quote) => set({ quote }),
  setSite: (site) => set({ site }),
  answerHearing: (questionId, raw) => {
    const q = QUESTIONS.find((x) => x.id === questionId);
    if (!q) return;
    set({ hearing: applyAnswer(get().hearing, q, raw) });
  },
  resetHearing: () => set({ hearing: {}, proposals: [], lastPlans: null }),
  makeProposals: () => {
    const s = get();
    const proposals = buildProposals(s.model, s.hearing, collectSiteFacts(s), s.priceBook);
    set({
      proposals,
      // 見積の取り込みは従来の形も使うので、そちらにも入れておく
      lastPlans: proposals.map((p) => ({ name: p.name, intent: p.line, ops: opsOf(p) })),
    });
  },
  patchQuote: (patch) => {
    const cur = get().quote;
    if (!cur) return;
    set({ quote: { ...cur, ...patch } });
  },
  setPriceBook: (priceBook) => set({ priceBook }),
  /* ── 数値で引く ──
     実測した寸法をそのまま打ち込めるようにする。
     いずれも履歴を積むので、取り消せる。 */
  drawExtend: (lengthMm, headingDeg) => {
    const { model, pendingNodeId } = get();
    let base = model;
    let startId = pendingNodeId;
    const has = (id: string | null) => !!id && base.levels[0]!.nodes.some((n) => n.id === id);
    if (!has(startId)) {
      const lv = base.levels[0]!;
      const last = lv.nodes[lv.nodes.length - 1];
      if (last) {
        startId = last.id;
      } else {
        base = structuredClone(base);
        base.levels[0]!.nodes.push({ id: 'n1', x: 0, y: 0, confidence: 'measured' });
        startId = 'n1';
      }
    }
    const r = extendWall(base, startId!, lengthMm, headingDeg, { confidence: 'measured' });
    commit(get, set, r.model, { pendingNodeId: r.nodeId, selected: { kind: 'node', id: r.nodeId } });
  },
  drawRect: (widthMm, depthMm) => {
    const { model, pendingNodeId } = get();
    const lv = model.levels[0]!;
    const start = lv.nodes.find((n) => n.id === pendingNodeId);
    const origin = start ? { x: start.x, y: start.y } : { x: 0, y: 0 };
    const r = addRectangle(model, origin, widthMm, depthMm, { confidence: 'measured' });
    commit(get, set, r.model, { pendingNodeId: r.nodeId, selected: null });
  },
  drawSetWallLength: (wallId, lengthMm, anchor) => {
    commit(get, set, setWallLength(get().model, wallId, lengthMm, anchor));
  },
  drawAlignWall: (wallId, axis) => {
    commit(get, set, alignWall(get().model, wallId, axis));
  },
  drawOrthogonalize: () => {
    commit(get, set, orthogonalize(get().model));
  },
  drawMergeNodes: () => {
    commit(get, set, mergeNearbyNodes(get().model));
  },
  drawMoveNode: (nodeId, x, y) => {
    commit(get, set, moveNode(get().model, nodeId, x, y));
  },
  toProject: () => {
    const s = get();
    const now = new Date().toISOString();
    const plans: RenovationPlan[] = (s.lastPlans ?? []).map((p, i) => ({
      id: 'plan-' + (i + 1),
      name: p.name,
      intent: p.intent,
      ops: p.ops,
      createdAt: now,
    }));
    return {
      id: s.projectId ?? 'prj-' + Date.now().toString(36),
      name: s.projectName || '無題の物件',
      property: { address: s.lastDiagnosis?.input.address, notes: '' },
      model: s.model,
      measurements: s.measurements,
      damagePins: s.damagePins,
      diagnosis: s.lastDiagnosis ?? undefined,
      plans,
      regionPackId: s.regionPackId,
      surveyNotes: s.surveyNotes,
      todoDone: s.todoDone,
      checklist: s.checklist,
      customChecks: s.customChecks,
      quote: s.quote ?? undefined,
      site: s.site ?? undefined,
      createdAt: now,
      updatedAt: now,
    };
  },
  hydrateProject: (p) => {
    const model = p.model ? structuredClone(p.model) : emptyModel();
    refreshRooms(model);
    set({
      projectId: p.id,
      projectName: p.name,
      model,
      measurements: p.measurements ?? [],
      damagePins: p.damagePins ?? [],
      surveyNotes: p.surveyNotes ?? '',
      regionPackId: p.regionPackId,
      lastDiagnosis: (p.diagnosis as { input: DiagnosisInput; report: DiagnosisReport } | undefined) ?? null,
      lastPlans: p.plans?.length
        ? p.plans.map((x) => ({ name: x.name, intent: x.intent, ops: x.ops }))
        : null,
      todoDone: p.todoDone ?? {},
      checklist: p.checklist ?? {},
      customChecks: p.customChecks ?? [],
      quote: (p.quote as QuoteDoc | undefined) ?? null,
      site: (p.site as Site | undefined) ?? null,
      history: [],
      future: [],
      selected: null,
      pendingNodeId: null,
    });
  },
  undo: () => {
    const { history, future, model } = get();
    const prev = history[history.length - 1];
    if (!prev) return;
    set({
      model: deserialize(prev),
      history: history.slice(0, -1),
      future: [serialize(model), ...future].slice(0, 50),
      selected: null,
      pendingNodeId: null,
    });
  },
  redo: () => {
    const { history, future, model } = get();
    const next = future[0];
    if (!next) return;
    set({
      model: deserialize(next),
      future: future.slice(1),
      history: [...history.slice(-49), serialize(model)],
      selected: null,
      pendingNodeId: null,
    });
  },
}),
    {
      name: 'hiraku-editor',
      partialize: (s) => ({
        model: s.model,
        measurements: s.measurements,
        damagePins: s.damagePins,
        surveyNotes: s.surveyNotes,
        projectId: s.projectId,
        projectName: s.projectName,
        regionPackId: s.regionPackId,
        lastDiagnosis: s.lastDiagnosis,
        lastPlans: s.lastPlans,
        todoDone: s.todoDone,
        checklist: s.checklist,
        customChecks: s.customChecks,
        checkUse: s.checkUse,
        quote: s.quote,
        site: s.site,
        hearing: s.hearing,
        proposals: s.proposals,
        priceBook: s.priceBook,
      }),
    },
  ),
);

let idCounter = 0;
export function freshId(prefix: string): string {
  idCounter += 1;
  return prefix + '_' + Date.now().toString(36) + '_' + idCounter;
}
