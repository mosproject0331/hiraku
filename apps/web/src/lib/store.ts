import { create } from 'zustand';
import {
  deserialize,
  detectRooms,
  serialize,
  solveConstraints,
  type DamagePin,
  type Measurement,
  type Opening,
  type SpaceModel,
} from '@hiraku/core';

export type Tool = 'select' | 'wall' | 'opening' | 'delete' | 'pin';
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
}

export const useEditor = create<EditorState>((set, get) => ({
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
}));

let idCounter = 0;
export function freshId(prefix: string): string {
  idCounter += 1;
  return prefix + '_' + Date.now().toString(36) + '_' + idCounter;
}
