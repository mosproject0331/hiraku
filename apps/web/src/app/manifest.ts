import type { MetadataRoute } from 'next';

const base = process.env.NEXT_PUBLIC_BASE_PATH || '';

// 静的書き出し（GitHub Pages など）でもファイルとして出せるようにする
export const dynamic = 'force-static';

/**
 * ホーム画面に置いて、アプリのように開けるようにする。
 * 現地では電波が弱いことが多いので、入口から縦画面・全画面で立ち上げる。
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'HIRAKU — 空き家をひらく',
    short_name: 'HIRAKU',
    description:
      '間取りを起こし、法規制を確かめ、改修の案と概算を出し、内見の記録と見積書までを一本でつなぐ道具。',
    start_url: `${base}/app/`,
    scope: `${base}/`,
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#f9f7f4',
    theme_color: '#f9f7f4',
    lang: 'ja',
    dir: 'ltr',
    categories: ['productivity', 'utilities'],
    icons: [
      { src: `${base}/icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: `${base}/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: `${base}/icon-maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: '内見チェック', short_name: '内見', url: `${base}/app/checklist/` },
      { name: '間取りをつくる', short_name: '間取り', url: `${base}/app/editor/` },
      { name: '御見積書', short_name: '見積', url: `${base}/app/quote/` },
    ],
  };
}
