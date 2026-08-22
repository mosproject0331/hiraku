'use client';

/**
 * 土台ごと落ちたときの、最後の受け皿。
 * ここは layout の外なので、自前で html/body を書く。
 */
export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="ja">
      <body
        style={{
          margin: 0,
          padding: '48px 24px',
          background: '#f9f7f4',
          color: '#0f0f0f',
          fontFamily: '"Hiragino Sans","Noto Sans JP",system-ui,sans-serif',
          lineHeight: 2,
        }}
      >
        <main style={{ maxWidth: 620, margin: '0 auto' }}>
          <p style={{ margin: 0, fontSize: 11, letterSpacing: '.24em', color: '#918d88' }}>
            うまく開けませんでした
          </p>
          <h1
            style={{
              fontFamily: '"Hiragino Mincho ProN","Yu Mincho",serif',
              fontSize: 26,
              lineHeight: 1.5,
              margin: '10px 0 0',
            }}
          >
            土台のところで止まりました。
          </h1>
          <p style={{ fontSize: 14, color: '#6d6a67' }}>
            記録はこの端末に残っています。開き直しても直らないときは、
            ブラウザを一度閉じてから開いてください。
          </p>
          <p style={{ fontSize: 12, color: '#918d88' }}>{error.message}</p>
          <button
            onClick={reset}
            style={{
              minHeight: 48,
              padding: '0 24px',
              borderRadius: 100,
              border: 0,
              background: '#ff773c',
              color: '#181818',
              fontSize: 15,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            開き直す
          </button>
        </main>
      </body>
    </html>
  );
}
