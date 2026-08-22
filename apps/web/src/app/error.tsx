'use client';

import { useEffect } from 'react';

/**
 * どこかが落ちたときの受け皿。
 *
 * 白い画面だけ出して終わるのがいちばん困る。
 * 何が起きたかを見せ、記録を失わずにやり直せる道を残す。
 */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // 開発中は詳しく見たい
    if (process.env.NODE_ENV !== 'production') console.error(error);
  }, [error]);

  return (
    <main className="crash">
      <p className="intake-kicker">うまく開けませんでした</p>
      <h1 className="intake-title">この画面が、途中で止まりました。</h1>
      <p className="intake-sub">
        記録（図面・内見・見積）はこの端末に残っています。消えていません。
        まず「開き直す」を試してください。
      </p>

      <div className="crash-actions">
        <button className="hb-btn hb-cta" onClick={reset}>開き直す</button>
        <a className="hb-btn hb-outline" href="/app">入口に戻る</a>
        <button className="hb-btn hb-outline" onClick={() => saveBackup()}>記録を書き出す</button>
      </div>

      <details className="crash-detail">
        <summary>何が起きたか</summary>
        <pre>{error.message}{error.digest ? `\n(${error.digest})` : ''}</pre>
        <p>
          同じところで何度も止まるときは、この文面を控えて知らせてください。
          最後の手段として、下から保存し直すと直ることがあります。
        </p>
        <button
          className="hb-btn hb-outline"
          onClick={() => {
            saveBackup();
            try {
              window.localStorage.removeItem('hiraku-editor');
            } catch {
              /* 消せなくても続ける */
            }
            window.location.href = '/app';
          }}
        >
          書き出してから、作業状態を初期化する
        </button>
      </details>
    </main>
  );
}

/** いまの記録をJSONで手元に落とす */
function saveBackup(): void {
  try {
    const raw = window.localStorage.getItem('hiraku-editor') ?? '{}';
    const blob = new Blob([raw], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `hiraku-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  } catch {
    /* 書き出せないときは何もしない */
  }
}
