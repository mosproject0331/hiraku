'use client';

import { useRef, useState } from 'react';
import { initialBackdrop } from '@hiraku/core';
import { extractFrames, imageSize, toStorableDataUrl, type ExtractedFrame } from '@/lib/video-frames';
import { useEditor } from '@/lib/store';

/** 動画のコマ／間取り図の写真を読み込んで、なぞるための下絵にする */
export default function BackdropLoader({ compact = false }: { compact?: boolean }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [frames, setFrames] = useState<ExtractedFrame[]>([]);

  async function onFile(file: File) {
    setBusy(true);
    setFrames([]);
    setMsg('');
    try {
      const isVideo = file.type.startsWith('video/') || /\.(mp4|mov|m4v|webm)$/i.test(file.name);
      if (isVideo) {
        setMsg('コマを取り出しています…');
        const fs = await extractFrames(file, 12, 1600, (d, t) =>
          setMsg(`コマを取り出しています… ${d}/${t}`),
        );
        if (!fs.length) throw new Error('コマを取り出せませんでした');
        setFrames(fs);
        setMsg('間取りが一番わかるコマを選んでください。');
      } else {
        setMsg('読み込んでいます…');
        await apply(await toStorableDataUrl(file));
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '読み込みに失敗しました');
    } finally {
      setBusy(false);
    }
  }

  async function apply(src: string) {
    const { w, h } = await imageSize(src);
    useEditor.getState().setBackdrop(initialBackdrop(src, w, h, 9100));
    useEditor.getState().setTool('backdrop');
    frames.forEach((f) => URL.revokeObjectURL(f.url));
    setFrames([]);
    setMsg('下絵を置きました。位置を合わせ、「実寸合わせ」で縮尺を決めてください。');
  }

  async function pick(f: ExtractedFrame) {
    setBusy(true);
    setMsg('取り込んでいます…');
    try {
      await apply(await toStorableDataUrl(f.blob));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '取り込みに失敗しました');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <input
        ref={fileRef}
        type="file"
        accept="video/*,image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onFile(f);
          e.target.value = '';
        }}
      />
      <button onClick={() => fileRef.current?.click()} disabled={busy} className="hb-btn hb-outline">
        {busy ? '処理中…' : compact ? '別の下絵' : '動画・写真から下絵'}
      </button>
      {msg && (
        <p className="hb-muted" style={{ fontSize: 12, lineHeight: 1.7, marginTop: 8 }}>
          {msg}
        </p>
      )}
      {frames.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill,minmax(92px,1fr))',
            gap: 6,
            marginTop: 8,
            maxHeight: 280,
            overflowY: 'auto',
          }}
        >
          {frames.map((f) => (
            <button
              key={f.url}
              onClick={() => void pick(f)}
              className="hb-sunken"
              style={{ padding: 0, overflow: 'hidden', lineHeight: 0, cursor: 'pointer' }}
              title={`${f.timeSec.toFixed(1)}秒のコマを下絵にする`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.url} alt={`${f.timeSec.toFixed(1)}秒のコマ`} style={{ width: '100%', display: 'block' }} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
