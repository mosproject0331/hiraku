import type { RenovationScene } from '@hiraku/core';

/**
 * 3Dの見え方を条件画像として渡し、写実的なパースに変換する。
 *
 * 大事なのは「絵を想像させない」こと。間取り・開口・寸法は3Dが持っている正解なので、
 * モデルには「形は変えず、材質と光だけを本物にする」と指示する。
 */
const KEY_STORAGE = 'hiraku-image-api-key';
const PROVIDER_STORAGE = 'hiraku-image-provider';

export type Provider = 'gemini';

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
}

/** Gemini に画像+指示を送り、写実パースを受け取る */
export async function renderPerspective(
  conditionPng: string,
  prompt: string,
  apiKey: string,
  model = 'gemini-3.1-flash-image',
): Promise<PerspectiveResult> {
  if (!apiKey) throw new Error('画像生成のAPIキーが設定されていません');
  const base64 = conditionPng.replace(/^data:image\/\w+;base64,/, '');

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              { inline_data: { mime_type: 'image/png', data: base64 } },
            ],
          },
        ],
        generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
      }),
    },
  );

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    const msg = body.error?.message ?? `画像の生成に失敗しました (HTTP ${res.status})`;
    if (res.status === 400 && /API key/i.test(msg)) throw new Error('APIキーが正しくないようです');
    if (res.status === 429) throw new Error('リクエストが多すぎます。少し置いてからお試しください');
    throw new Error(msg);
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string; inline_data?: { mime_type: string; data: string }; inlineData?: { mimeType: string; data: string } }[] } }[];
  };
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const img = parts.find((p) => p.inline_data?.data || p.inlineData?.data);
  const raw = img?.inline_data?.data ?? img?.inlineData?.data;
  if (!raw) {
    const text = parts.find((p) => p.text)?.text;
    throw new Error(text ? `画像が返りませんでした: ${text.slice(0, 120)}` : '画像が返りませんでした');
  }
  const mime = img?.inline_data?.mime_type ?? img?.inlineData?.mimeType ?? 'image/png';
  return { dataUrl: `data:${mime};base64,${raw}`, note: parts.find((p) => p.text)?.text };
}
