import { NextResponse } from 'next/server';
import { reportQA } from '@hiraku/llm';
import { clientKey, rateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const limit = rateLimit('qa:' + clientKey(req), 30, 300);
  if (!limit.ok) {
    return NextResponse.json(
      { error: `質問の回数が多すぎます。${limit.retryAfterSec}秒ほど置いてからお試しください。` },
      { status: 429, headers: { 'retry-after': String(limit.retryAfterSec) } },
    );
  }
  const { question, context } = (await req.json()) as { question?: string; context?: string };
  if (!question || typeof question !== 'string') {
    return NextResponse.json({ error: 'questionが必要です' }, { status: 400 });
  }
  if (question.length > 1000 || (context ?? '').length > 60_000) {
    return NextResponse.json({ error: '質問または文脈が長すぎます' }, { status: 413 });
  }
  const answer = await reportQA(question, context ?? '');
  return NextResponse.json({ answer });
}
