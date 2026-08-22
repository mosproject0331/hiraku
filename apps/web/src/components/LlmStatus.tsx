'use client';

import { useEffect, useState } from 'react';
import { isStatic } from '@/lib/ai';

export default function LlmStatus() {
  const [s, setS] = useState<{ llmMode: string; note: string } | null>(null);
  useEffect(() => {
    if (isStatic) {
      setS({ llmMode: 'mock', note: 'この公開版はモックで動いています。ネットに繋がっていなくても全機能が使えます。' });
      return;
    }
    fetch('/api/status')
      .then((r) => r.json())
      .then(setS)
      .catch(() => setS(null));
  }, []);
  if (!s) return null;
  const live = s.llmMode === 'live';
  return (
    <span
      className="hb-badge"
      title={s.note}
      style={
        live
          ? { background: '#e8f3ec', borderColor: '#b9dcc8', color: '#2f7a58' }
          : undefined
      }
    >
      AI: {live ? '接続中' : 'モック（オフライン可）'}
    </span>
  );
}
