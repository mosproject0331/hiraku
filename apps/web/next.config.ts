import type { NextConfig } from 'next';

const isStatic = process.env.NEXT_PUBLIC_STATIC === '1';
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

const nextConfig: NextConfig = {
  transpilePackages: [
    '@hiraku/core',
    '@hiraku/rules',
    '@hiraku/report',
    '@hiraku/estimate',
    '@hiraku/llm',
    '@hiraku/regionpack',
    '@hiraku/knowledge',
  ],
  // 静的公開（GitHub Pages など）: サーバー不要。保存はすべてブラウザの中
  ...(isStatic
    ? {
        output: 'export' as const,
        basePath: basePath || undefined,
        trailingSlash: true,
        images: { unoptimized: true },
      }
    : {}),
};

export default nextConfig;
