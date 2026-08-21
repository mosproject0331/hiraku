import { NextResponse } from 'next/server';
import type { Project } from '@hiraku/core';
import { repo } from '@/lib/repo-server';

export async function GET() {
  return NextResponse.json(await repo.list());
}

export async function POST(req: Request) {
  const p = (await req.json()) as Project;
  if (!p?.id || !p?.name) {
    return NextResponse.json({ error: 'idとnameが必要です' }, { status: 400 });
  }
  p.updatedAt = new Date().toISOString();
  if (!p.createdAt) p.createdAt = p.updatedAt;
  await repo.save(p);
  return NextResponse.json({ ok: true, id: p.id });
}
