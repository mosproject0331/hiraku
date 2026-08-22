'use client';

import { useEffect } from 'react';

/**
 * 現地で電波が無くても開けるように、サービスワーカーを登録する。
 * 開発中は入れない（作りかけの画面が手元に残ると分かりにくいため）。
 */
export default function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const base = process.env.NEXT_PUBLIC_BASE_PATH || '';
    const url = `${base}/sw.js`;
    const onLoad = () => {
      navigator.serviceWorker.register(url, { scope: `${base}/` }).catch(() => {
        /* 登録できなくても本体は動く */
      });
    };
    if (document.readyState === 'complete') onLoad();
    else window.addEventListener('load', onLoad, { once: true });
    return () => window.removeEventListener('load', onLoad);
  }, []);
  return null;
}
