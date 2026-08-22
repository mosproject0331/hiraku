import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'HIRAKU — 動画一本で、空き家の可能性がわかる',
  description:
    '動画から間取りを起こし、法規制を診断し、改修費の見当までつける。空き家活用のためのAIツール。',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Noto+Sans+JP:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
