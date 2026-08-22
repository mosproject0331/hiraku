import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const MEDIA_DIR = path.join(process.cwd(), '.data', 'media');
const TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif',
};

export async function GET(_req: Request, ctx: { params: Promise<{ id: string; file: string }> }) {
  const { id, file } = await ctx.params;
  // パストラバーサル防止: 英数字とドットのみ許可
  if (!/^[a-z0-9]{1,32}$/i.test(id) || !/^[a-z0-9_-]{1,32}\.(jpg|png|webp|gif)$/i.test(file)) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  try {
    const buf = await readFile(path.join(MEDIA_DIR, id, file));
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'content-type': TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
        'cache-control': 'public, max-age=31536000, immutable',
      },
    });
  } catch {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
}
