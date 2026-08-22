import { NextResponse } from 'next/server';
import { currentMode } from '@hiraku/llm';

export const runtime = 'nodejs';

export async function GET() {
  const mode = currentMode();
  return NextResponse.json({
    llmMode: mode,
    hasApiKey: Boolean(process.env.ANTHROPIC_API_KEY),
    model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6',
    note:
      mode === 'mock'
        ? 'モックで動いています。ネットに繋がっていなくても全機能が使えます。実際のAIに繋ぐには ANTHROPIC_API_KEY を設定し LLM_MODE=live で起動してください。'
        : '実際のAIに接続しています。',
  });
}
