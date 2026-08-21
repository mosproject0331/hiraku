import type { SpaceModel } from './types';

const SCHEMA = 'hiraku/space-model';
const CURRENT_VERSION = 1;

export interface SerializedModel {
  schema: typeof SCHEMA;
  version: number;
  model: SpaceModel;
}

export function serialize(model: SpaceModel): string {
  const payload: SerializedModel = {
    schema: SCHEMA,
    version: model.version || CURRENT_VERSION,
    model,
  };
  return JSON.stringify(payload, null, 2);
}

export function deserialize(text: string): SpaceModel {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('JSONとして読み込めませんでした');
  }
  if (typeof raw !== 'object' || raw === null) throw new Error('不正なデータ形式です');
  const obj = raw as Record<string, unknown>;
  if (obj['schema'] !== SCHEMA) throw new Error('hirakuの空間モデルではありません');
  const model = obj['model'] as SpaceModel | undefined;
  if (!model || !Array.isArray(model.levels)) throw new Error('モデル本体がありません');
  for (const level of model.levels) {
    if (!Array.isArray(level.nodes) || !Array.isArray(level.walls)) {
      throw new Error('レベル構造が不正です');
    }
    level.openings = level.openings ?? [];
    level.rooms = level.rooms ?? [];
  }
  model.version = typeof obj['version'] === 'number' ? (obj['version'] as number) : CURRENT_VERSION;
  model.moduleMm = model.moduleMm || 910;
  model.scaleFactor = model.scaleFactor || 1;
  return model;
}
