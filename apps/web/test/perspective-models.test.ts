import { afterEach, describe, expect, it, vi } from 'vitest';
import { listImageModels, rankModel } from '../src/lib/perspective';

const ok = (models: unknown[]) =>
  vi.fn(async () => new Response(JSON.stringify({ models }), { status: 200 }));

afterEach(() => vi.unstubAllGlobals());

describe('使えるモデルをGoogleに聞く', () => {
  it('画像を返せないものは落とす', async () => {
    vi.stubGlobal('fetch', ok([
      { name: 'models/gemini-3.1-flash-image', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-3-pro-image', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-3.1-flash', supportedGenerationMethods: ['generateContent'] },      // 画像でない
      { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] },        // 埋め込み
      { name: 'models/gemini-2.5-flash-image', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/veo-3.0-generate-image', supportedGenerationMethods: ['predictLongRunning'] }, // 動画
    ]));
    const got = await listImageModels('dummy');
    expect(got.map((m) => m.id)).toEqual([
      'gemini-3-pro-image',       // 3系のpro が先頭
      'gemini-3.1-flash-image',
      'gemini-2.5-flash-image',
    ]);
  });

  it('新しいもの・上位のものほど先に来る', () => {
    const r = rankModel;
    expect(r('gemini-3-pro-image')).toBeGreaterThan(r('gemini-3.1-flash-image'));
    expect(r('gemini-3.1-flash-image')).toBeGreaterThan(r('gemini-3.1-flash-lite-image'));
    expect(r('gemini-3.1-flash-image')).toBeGreaterThan(r('gemini-2.5-flash-image'));
  });

  it('モデル名が全部変わっても、画像と名乗るものがあれば拾える', async () => {
    vi.stubGlobal('fetch', ok([
      { name: 'models/banana-9-ultra-image', displayName: 'Banana 9', supportedGenerationMethods: ['generateContent'] },
    ]));
    const got = await listImageModels('dummy');
    expect(got).toHaveLength(1);
    expect(got[0]!.label).toBe('Banana 9');
  });

  it('キーが違えば、日本語で理由が返る', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ error: { message: 'API key not valid. Please pass a valid API key.' } }),
      { status: 400 },
    )));
    await expect(listImageModels('bad')).rejects.toThrow(/APIキーが正しくない/);
  });

  it('キーが空なら通信しない', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    await expect(listImageModels('')).rejects.toThrow(/APIキー/);
    expect(f).not.toHaveBeenCalled();
  });
});
