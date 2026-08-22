import { NextResponse } from 'next/server';
import { hearingTurn } from '@hiraku/llm';
import { clientKey, rateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const MAX_MODEL_BYTES = 400_000;
const MAX_MESSAGES = 30;
const MAX_MESSAGE_CHARS = 2000;

export async function POST(req: Request) {
  try {
    const limit = rateLimit('hearing:' + clientKey(req), 20, 300);
    if (!limit.ok) {
      return NextResponse.json(
        { error: `相談の回数が多すぎます。${limit.retryAfterSec}秒ほど置いてからお試しください。` },
        { status: 429, headers: { 'retry-after': String(limit.retryAfterSec) } },
      );
    }
    const body = (await req.json()) as { modelJson?: string; userMessages?: string[] };
    if (!body.modelJson || !Array.isArray(body.userMessages)) {
      return NextResponse.json({ error: 'modelJson と userMessages が必要です' }, { status: 400 });
    }
    if (body.modelJson.length > MAX_MODEL_BYTES) {
      return NextResponse.json({ error: '間取りのデータが大きすぎます' }, { status: 413 });
    }
    if (body.userMessages.length > MAX_MESSAGES || body.userMessages.some((m) => typeof m !== 'string' || m.length > MAX_MESSAGE_CHARS)) {
      return NextResponse.json({ error: 'メッセージが長すぎます' }, { status: 413 });
    }
    const turn = await hearingTurn(body.modelJson, body.userMessages);
    return NextResponse.json(turn);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'unknown error' },
      { status: 500 },
    );
  }
}
