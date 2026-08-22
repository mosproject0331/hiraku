import { execFile } from 'node:child_process';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 120;

const run = promisify(execFile);
const MEDIA_DIR = path.join(process.cwd(), '.data', 'media');
const MAX_BYTES = 300 * 1024 * 1024;
const FRAME_COUNT = 16;

function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

async function ffmpegPath(): Promise<string | null> {
  for (const p of ['ffmpeg', '/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/usr/bin/ffmpeg']) {
    try {
      await run(p, ['-version']);
      return p;
    } catch {
      // 次を試す
    }
  }
  return null;
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'file が必要です' }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'ファイルが大きすぎます（300MBまで）' }, { status: 413 });
    }

    const id = newId();
    const dir = path.join(MEDIA_DIR, id);
    await mkdir(dir, { recursive: true });
    const buf = Buffer.from(await file.arrayBuffer());
    const isVideo = file.type.startsWith('video/') || /\.(mp4|mov|m4v|webm|avi)$/i.test(file.name);

    if (!isVideo) {
      const ext = (file.name.match(/\.(jpe?g|png|webp|gif|heic)$/i)?.[1] ?? 'jpg').toLowerCase();
      const name = `0.${ext === 'jpeg' ? 'jpg' : ext}`;
      await writeFile(path.join(dir, name), buf);
      return NextResponse.json({ id, kind: 'image', frames: [`/api/media/${id}/${name}`] });
    }

    const ff = await ffmpegPath();
    if (!ff) {
      return NextResponse.json(
        {
          error:
            '動画のコマ出しには ffmpeg が必要です。ターミナルで「brew install ffmpeg」を実行するか、写真（間取り図の撮影など）を読み込んでください。',
        },
        { status: 501 },
      );
    }

    const src = path.join(dir, 'src' + path.extname(file.name || '.mp4'));
    await writeFile(src, buf);
    // 動画全体から等間隔で FRAME_COUNT 枚。長辺1600pxに縮小
    await run(ff, [
      '-hide_banner', '-loglevel', 'error', '-i', src,
      '-vf', `thumbnail,scale='min(1600,iw)':-2`,
      '-frames:v', String(FRAME_COUNT),
      '-vsync', 'vfr',
      path.join(dir, 'f%02d.jpg'),
    ]).catch(async () => {
      // thumbnail フィルタが効かない動画向けのフォールバック
      await run(ff, [
        '-hide_banner', '-loglevel', 'error', '-i', src,
        '-vf', `fps=1/2,scale='min(1600,iw)':-2`,
        '-frames:v', String(FRAME_COUNT),
        path.join(dir, 'f%02d.jpg'),
      ]);
    });

    const frames = (await readdir(dir))
      .filter((f) => f.endsWith('.jpg'))
      .sort()
      .map((f) => `/api/media/${id}/${f}`);

    if (frames.length === 0) {
      return NextResponse.json({ error: 'この動画からコマを取り出せませんでした' }, { status: 422 });
    }
    return NextResponse.json({ id, kind: 'video', frames });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '読み込みに失敗しました' },
      { status: 500 },
    );
  }
}
