import type { RenovationScene } from '@hiraku/core';

/**
 * 3Dの見え方を条件画像として渡し、写実的なパースに変換する。
 *
 * 大事なのは「絵を想像させない」こと。間取り・開口・寸法は3Dが持っている正解なので、
 * モデルには「形は変えず、材質と光だけを本物にする」と指示する。
 */
const KEY_STORAGE = 'hiraku-image-api-key';
const PROVIDER_STORAGE = 'hiraku-image-provider';
const MODEL_STORAGE = 'hiraku-image-model';

export type Provider = 'gemini';

/** Google の生成API。画像モデルは v1beta にしかいない */
const API_ROOT = 'https://generativelanguage.googleapis.com/v1beta';

export function getApiKey(): string {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(KEY_STORAGE) ?? '';
}
export function setApiKey(key: string): void {
  if (key) window.localStorage.setItem(KEY_STORAGE, key);
  else window.localStorage.removeItem(KEY_STORAGE);
}
export function getProvider(): Provider {
  return (window.localStorage.getItem(PROVIDER_STORAGE) as Provider) || 'gemini';
}
export function getModel(): string {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(MODEL_STORAGE) ?? '';
}
export function setModel(id: string): void {
  if (id) window.localStorage.setItem(MODEL_STORAGE, id);
  else window.localStorage.removeItem(MODEL_STORAGE);
}

export interface ImageModel {
  /** models/ を外した素のID */
  id: string;
  label: string;
  /** 新しい・上位のものほど大きい。既定の選択に使う */
  rank: number;
}

/**
 * どのモデル名が有効かは、こちらでは決められない。Google側の一覧に聞く。
 * 名前は将来変わるので、ID決め打ちではなく「画像を返せると宣言しているもの」を拾う。
 */
export function rankModel(id: string): number {
  const v = /(\d+(?:\.\d+)?)/.exec(id);
  let r = v ? Number(v[1]) * 10 : 0;
  if (/pro/.test(id)) r += 4;
  if (/lite/.test(id)) r -= 2;
  if (/preview|exp|latest/.test(id)) r -= 1;
  return r;
}

interface RawModel {
  name?: string;
  displayName?: string;
  description?: string;
  supportedGenerationMethods?: string[];
  supportedActions?: string[];
}

/** そのキーで実際に使える画像モデルを一覧する。キーの確認も兼ねる */
export async function listImageModels(apiKey: string): Promise<ImageModel[]> {
  if (!apiKey) throw new Error('APIキーが入っていません');
  const res = await fetch(`${API_ROOT}/models?pageSize=1000`, {
    headers: { 'x-goog-api-key': apiKey },
  });
  if (!res.ok) throw new Error(await errorMessage(res));
  const data = (await res.json()) as { models?: RawModel[] };
  const out: ImageModel[] = [];
  for (const m of data.models ?? []) {
    const id = (m.name ?? '').replace(/^models\//, '');
    if (!id) continue;
    const methods = m.supportedGenerationMethods ?? m.supportedActions ?? [];
    if (!methods.some((x) => /generateContent|predict/i.test(x))) continue;
    // 画像を「出せる」ものだけ。embedding や TTS、音声、動画は落とす
    if (!/image/i.test(id)) continue;
    if (/embed|vision-only|tts|audio|video|veo|imagen-\d+-.*-edit/i.test(id)) continue;
    out.push({ id, label: m.displayName || id, rank: rankModel(id) });
  }
  out.sort((a, b) => b.rank - a.rank || a.id.localeCompare(b.id));
  return out;
}

async function errorMessage(res: Response): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as
    | { error?: { message?: string; status?: string } }
    | { error?: { message?: string } }[];
  const err = Array.isArray(body) ? body[0]?.error : body.error;
  const msg = err?.message ?? '';
  if (res.status === 400 && /API key/i.test(msg)) return 'APIキーが正しくないようです。貼り間違いか、無効になっている可能性があります';
  if (res.status === 403) return 'このキーでは許可されていません。Google AI Studio でキーの制限を確認してください';
  if (res.status === 404) return 'このモデルはこのキーでは使えません';
  if (res.status === 429) return '回数の上限に当たりました。少し置いてからお試しください';
  if (res.status >= 500) return 'Google側が混み合っているようです。少し置いてからお試しください';
  return msg || `通信に失敗しました (HTTP ${res.status})`;
}

export interface PerspectiveOptions {
  /** カフェ・宿など、その場でやること */
  use?: string;
  /** 時間帯・光 */
  light?: string;
  /** 建物の性格 */
  character?: string;
}

/** 3Dシーンの内容から、写実化の指示文をつくる */
export function buildPrompt(scene: RenovationScene, cameraLabel: string, opt: PerspectiveOptions = {}): string {
  const rooms = scene.rooms
    .map((r) => {
      const parts = [
        `${r.name} (${r.areaM2.toFixed(1)} m2)`,
        `floor: ${r.floor.phrase}`,
        `walls: ${r.wall.phrase}`,
        `ceiling: ${r.ceiling.phrase}`,
      ];
      if (r.waterUnits.length) {
        const u = r.waterUnits
          .map((x) => ({ kitchen: 'kitchen counter', toilet: 'toilet', bath: 'bathtub', sink: 'washbasin' })[x])
          .join(', ');
        parts.push(`fixtures: ${u}`);
      }
      if (r.lights) parts.push(`${r.lights} pendant lights`);
      return '- ' + parts.join('; ');
    })
    .join('\n');

  return [
    'INPUT: a physically-lit 3D architectural render of a real Japanese vacant house (kominka) renovation plan.',
    'It already carries the surveyed geometry, the correct materials, the sun direction and the furniture layout.',
    'TASK: turn this render into a photograph of the same room. Refine it — do not reinterpret it.',
    '',
    'ABSOLUTE RULES — the geometry is survey data, not a suggestion:',
    '- Keep the exact same camera position, angle, focal length and framing. Vertical lines stay vertical.',
    '- Keep every wall, post, beam, opening, window and door at exactly the same position and size.',
    '- Keep the ceiling height and the room proportions exactly as shown.',
    '- Keep the furniture where it is. Do not add, remove, restyle or rearrange it.',
    '- Keep the direction and time of the light exactly as rendered, including where the sun patch falls.',
    '- Do not add walls, windows, doors, rooms, people, text or watermarks.',
    '',
    'WHAT TO ADD — surface truth only:',
    '- Real material micro-detail: timber grain and end-grain, plaster tooth and trowel marks, tatami weave,',
    '  the grit of an earthen doma floor, fabric nap, ceramic glaze, the slight unevenness of old timber.',
    '- Honest imperfection: settled dust, faint stains near the sill, worn edges where hands and feet pass.',
    '- Correct camera behaviour: natural white balance, gentle highlight roll-off in the window,',
    '  soft bounce light on the ceiling, contact shadows under every object, fine grain.',
    '',
    'Materials in this space:',
    rooms,
    '',
    opt.use ? `Intended use of the space: ${opt.use}.` : '',
    opt.character
      ? `Character: ${opt.character}.`
      : 'Character: a 60-year-old Japanese timber house, honest and unpolished, lived-in, not a showroom.',
    opt.light ? `Light: ${opt.light}.` : 'Light: soft daylight entering from the windows shown, late morning.',
    '',
    'Style: interior architectural photography on a full-frame camera, 24mm tilt-shift, f/5.6,',
    'natural colour, no HDR halos, no fisheye, no lens flare, no stylisation.',
    scene.changes.length ? `\nThe plan changes: ${scene.changes.join(' / ')}.` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export interface PerspectiveResult {
  dataUrl: string;
  note?: string;
  /** 実際に使われたモデル */
  model?: string;
  /** Google 側で数えられたトークン。課金の目安 */
  tokens?: number;
}

/** Gemini に画像+指示を送り、写実パースを受け取る */
export async function renderPerspective(
  /** 3Dから取り込んだ下絵（データURL。PNGでもJPEGでもよい） */
  conditionPng: string,
  prompt: string,
  apiKey: string,
  model = getModel(),
): Promise<PerspectiveResult> {
  if (!apiKey) throw new Error('画像生成のAPIキーが設定されていません');
  const head = /^data:(image\/[\w+.-]+);base64,/.exec(conditionPng);
  const conditionMime = head?.[1] ?? 'image/png';
  const base64 = conditionPng.replace(/^data:image\/[\w+.-]+;base64,/, '');

  // モデル名は決め打ちにしない。指定がなければ、そのキーで使えるものを聞いてから選ぶ。
  let id = model;
  if (!id) {
    const found = await listImageModels(apiKey);
    if (!found.length) {
      throw new Error('このキーで使える画像モデルが見つかりませんでした。Google AI Studio でモデルへのアクセスを確認してください');
    }
    id = found[0]!.id;
    setModel(id);
  }

  const res = await fetch(`${API_ROOT}/models/${id}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            { inline_data: { mime_type: conditionMime, data: base64 } },
          ],
        },
      ],
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'], temperature: 0.2 },
    }),
  });

  if (!res.ok) {
    // 選んでいたモデルが消えた/使えなくなった場合だけ、一覧を取り直して1回やり直す
    if ((res.status === 404 || res.status === 400) && model) {
      setModel('');
      const found = await listImageModels(apiKey).catch(() => [] as ImageModel[]);
      const next = found.find((m) => m.id !== model);
      if (next) {
        setModel(next.id);
        return renderPerspective(conditionPng, prompt, apiKey, next.id);
      }
    }
    throw new Error(await errorMessage(res));
  }

  const data = (await res.json()) as {
    candidates?: {
      finishReason?: string;
      content?: {
        parts?: {
          text?: string;
          inline_data?: { mime_type: string; data: string };
          inlineData?: { mimeType: string; data: string };
        }[];
      };
    }[];
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
    promptFeedback?: { blockReason?: string };
  };

  const cand = data.candidates?.[0];
  const parts = cand?.content?.parts ?? [];
  const img = parts.find((x) => x.inline_data?.data || x.inlineData?.data);
  const raw = img?.inline_data?.data ?? img?.inlineData?.data;
  const text = parts.find((x) => x.text)?.text;

  if (!raw) {
    const blocked = data.promptFeedback?.blockReason ?? cand?.finishReason;
    if (blocked && blocked !== 'STOP') {
      throw new Error(`画像が返りませんでした（${blocked}）。下絵か指示文が弾かれた可能性があります`);
    }
    throw new Error(text ? `画像が返りませんでした: ${text.slice(0, 120)}` : '画像が返りませんでした');
  }

  const mime = img?.inline_data?.mime_type ?? img?.inlineData?.mimeType ?? 'image/png';
  return {
    dataUrl: `data:${mime};base64,${raw}`,
    note: text,
    model: id,
    tokens: data.usageMetadata?.totalTokenCount,
  };
}
