'use client';

import { useState } from 'react';
import { reverseLookup, USE_LABEL, type DesiredUse } from '@hiraku/rules';
import { renderModeAReport } from '@hiraku/report';
import ReportFrame from '@/components/ReportFrame';

const USE_CARDS: { use: DesiredUse; desc: string }[] = [
  { use: 'cafe', desc: '飲食を出す。人が集まる定番の形' },
  { use: 'minpaku', desc: '届出制で始めやすい宿。年180日まで' },
  { use: 'kani_shukuhaku', desc: '許可制の宿。日数上限なし' },
  { use: 'sharehouse', desc: '暮らしを共有する場' },
  { use: 'atelier', desc: 'ものづくり・制作の拠点' },
  { use: 'retail', desc: '物を売る店' },
  { use: 'coworking', desc: '働く場所を開く' },
  { use: 'library', desc: '本を介した交流の場' },
  { use: 'home_plus', desc: '住みながら小さく開く' },
];

export default function WizardPage() {
  const [use, setUse] = useState<DesiredUse | null>(null);
  const [scale, setScale] = useState('小');
  const [region, setRegion] = useState('');
  const [html, setHtml] = useState<string | null>(null);

  if (html) return <div className="h-screen"><ReportFrame html={html} onBack={() => setHtml(null)} /></div>;

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <a href="/app" className="text-sm text-slate-500 hover:text-slate-800">← HIRAKU</a>
      <h1 className="mt-2 text-2xl font-bold">モードA: これから物件を探す</h1>
      <p className="mt-1 text-sm text-slate-600">やりたいことを選ぶと、探すべき物件の条件と内見チェックリストをつくります。</p>

      <h2 className="mt-6 text-sm font-semibold text-slate-500">1. やりたい用途</h2>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {USE_CARDS.map((c) => (
          <button
            key={c.use}
            onClick={() => setUse(c.use)}
            className={
              'rounded-lg border p-3 text-left text-sm transition ' +
              (use === c.use ? 'border-slate-800 bg-slate-800 text-white' : 'border-slate-300 bg-white hover:border-slate-400')
            }
          >
            <div className="font-semibold">{USE_LABEL[c.use]}</div>
            <div className={'mt-0.5 text-xs ' + (use === c.use ? 'text-slate-300' : 'text-slate-500')}>{c.desc}</div>
          </button>
        ))}
      </div>

      <h2 className="mt-6 text-sm font-semibold text-slate-500">2. 規模感</h2>
      <div className="mt-2 flex gap-2">
        {['小', '中', '大'].map((s) => (
          <button
            key={s}
            onClick={() => setScale(s)}
            className={
              'rounded-md border px-4 py-2 text-sm ' +
              (scale === s ? 'border-slate-800 bg-slate-800 text-white' : 'border-slate-300 bg-white hover:border-slate-400')
            }
          >
            {s}
          </button>
        ))}
      </div>

      <h2 className="mt-6 text-sm font-semibold text-slate-500">3. 想定地域(任意)</h2>
      <input
        value={region}
        onChange={(e) => setRegion(e.target.value)}
        placeholder="例: 兵庫県三田市"
        className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
      />

      <button
        disabled={!use}
        onClick={() => {
          if (!use) return;
          setHtml(renderModeAReport(reverseLookup(use), scale, region));
        }}
        className="mt-8 w-full rounded-lg bg-slate-800 py-3 font-semibold text-white disabled:opacity-40"
      >
        条件と内見チェックリストをつくる
      </button>
    </main>
  );
}
