import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  calibrateBackdrop,
  deserialize,
  detectRooms,
  serialize,
  solveConstraints,
  type Backdrop,
  type DamagePin,
  type Measurement,
  type Opening,
  type Project,
  type RenovationPlan,
  type SpaceModel,
} from '@hiraku/core';
import type { DiagnosisInput, DiagnosisReport } from '@hiraku/rules';
import type { HearingPlan } from '@hiraku/llm';
import type { PriceBook } from '@hiraku/estimate';

export type Tool = 'select' | 'wall' | 'opening' | 'delete' | 'pin' | 'backdrop' | 'calibrate';
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
  setPriceBook: (priceBook) => set({ priceBook }),
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
