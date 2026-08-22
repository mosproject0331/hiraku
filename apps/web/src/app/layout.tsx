import type { Metadata, Viewport } from 'next';
import { Geist } from 'next/font/google';
import ServiceWorker from '@/components/ServiceWorker';
import './globals.css';

// 欧文だけ自前で配る。和文は端末の標準の書体を使う（携帯での読み込みが軽くなる）
const geist = Geist({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-geist',
});

const base = process.env.NEXT_PUBLIC_BASE_PATH || '';

export const metadata: Metadata = {
  title: 'HIRAKU — 動画一本から、空き家の可能性を確かめる',
  description:
    '動画や写真を下絵に間取りを起こし、法規制を診断し、改修費の見当までつける。空き家活用のためのAIツール。',
  applicationName: 'HIRAKU',
  manifest: `${base}/manifest.webmanifest`,
  appleWebApp: { capable: true, title: 'HIRAKU', statusBarStyle: 'default' },
  icons: {
    icon: [
      { url: `${base}/favicon-32.png`, sizes: '32x32', type: 'image/png' },
      { url: `${base}/icon.svg`, type: 'image/svg+xml' },
    ],
    apple: `${base}/apple-touch-icon.png`,
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // ノッチのある端末でも、下端まで背景を敷く
  viewportFit: 'cover',
  themeColor: '#f9f7f4',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className={geist.variable}>
      <body>
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
