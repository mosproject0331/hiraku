import { NextResponse } from 'next/server';
import { reportQA } from '@hiraku/llm';

export async function POST(req: Request) {
  const { question, context } = (await req.json()) as { question?: string; context?: string };
  if (!question) return NextResponse.json({ error: 'questionが必要です' }, { status: 400 });
  const answer = await reportQA(question, context ?? '');
  return NextResponse.json({ answer });
}
