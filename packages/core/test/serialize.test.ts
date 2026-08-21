import { describe, expect, it } from 'vitest';
import { deserialize, serialize } from '../src/index';
import raw from '../fixtures/sample-minka.json';

describe('serialize / deserialize', () => {
  it('ラウンドトリップで同一モデルに戻る', () => {
    const model = deserialize(JSON.stringify(raw));
    const again = deserialize(serialize(model));
    expect(again).toEqual(model);
  });

  it('壊れたJSONは明示エラー', () => {
    expect(() => deserialize('{oops')).toThrow('JSON');
  });

  it('スキーマ違いは明示エラー', () => {
    expect(() => deserialize(JSON.stringify({ schema: 'other', model: {} }))).toThrow('空間モデル');
  });
});
