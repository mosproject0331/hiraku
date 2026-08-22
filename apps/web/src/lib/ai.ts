import { mockHearingTurn, mockReportQA, type HearingTurn } from '@hiraku/llm/mock';

/**
 * 静的公開（GitHub Pages など）ではサーバーが無いので、
 * モックの応答をブラウザの中で直接つくる。
 * サーバーがある環境ではAPI経由になり、APIキーがあれば実際のAIに繋がる。
 */
const STATIC = process.env.NEXT_PUBLIC_STATIC === '1';

export async function askHearing(modelJson: string, userMessages: string[]): Promise<HearingTurn> {
  if (STATIC) return mockHearingTurn(modelJson, userMessages);
  const res = await fetch('/api/hearing', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ modelJson, userMessages }),
  });
  const data = (await res.json()) as HearingTurn & { error?: string };
  if (!res.ok || data.error) throw new Error(data.error ?? '相談に失敗しました');
  return data;
}

export async function askQuestion(question: string, context: string): Promise<string> {
  if (STATIC) return mockReportQA(question);
  const res = await fetch('/api/qa', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ question, context }),
  });
  const data = (await res.json()) as { answer?: string; error?: string };
  if (!res.ok || data.error) throw new Error(data.error ?? '質問に失敗しました');
  return data.answer ?? '';
}

/** 画像などの静的ファイルのURL（GitHub Pages のサブパスに対応） */
export const asset = (path: string): string =>
  (process.env.NEXT_PUBLIC_BASE_PATH ?? '') + path;

export const isStatic = STATIC;
