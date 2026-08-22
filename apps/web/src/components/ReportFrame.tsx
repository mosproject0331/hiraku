'use client';

import { useRef } from 'react';

export default function ReportFrame({ html, onBack }: { html: string; onBack?: () => void }) {
  const ref = useRef<HTMLIFrameElement>(null);
  return (
    <div className="flex h-full flex-col">
      <div className="reportframe-bar flex items-center gap-2 border-b border-slate-200 bg-white px-4 py-2">
        {onBack && (
          <button onClick={onBack} className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
            入力に戻る
          </button>
        )}
        <button
          onClick={() => ref.current?.contentWindow?.print()}
          className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-700"
        >
          印刷 / PDF保存
        </button>
        <span className="text-xs text-slate-500">診断は参考情報です。実際の可否は窓口・専門家にご確認ください。</span>
      </div>
      <iframe ref={ref} srcDoc={html} className="min-h-0 flex-1 bg-white" title="レポート" />
    </div>
  );
}
