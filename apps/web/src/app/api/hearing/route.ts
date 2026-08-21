import { NextResponse } from 'next/server';
import { hearingTurn } from '@hiraku/llm';

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { modelJson?: string; userMessages?: string[] };
    if (!body.modelJson || !Array.isArray(body.userMessages)) {
      return NextResponse.json({ error: 'modelJson と userMessages が必要です' }, { status: 400 });
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
