'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { WORK_ITEMS, applyPriceBook, parsePriceCsv, priceTemplateCsv } from '@hiraku/estimate';
import { useEditor } from '@/lib/store';

export default function PricesPage() {
  const priceBook = useEditor((s) => s.priceBook);
  const fileRef = useRef<HTMLInputElement>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [msg, setMsg] = useState('');
  const items = useMemo(() => applyPriceBook(priceBook), [priceBook]);
  const verifiedCount = items.filter((w) => w.materialUnitPrice.verified).length;

  function download() {
    const blob = new Blob([priceTemplateCsv()], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'hiraku-単価テンプレート.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function load(file: File) {
    const { book, errors } = parsePriceCsv(await file.text());
    setErrors(errors);
    const n = Object.keys(book).length;
    if (n) {
      useEditor.getState().setPriceBook({ ...priceBook, ...book });
      setMsg(`${n}件の単価を取り込みました。以降の見積に反映されます。`);
    } else {
      setMsg('取り込める行がありませんでした。');
    }
  }

  return (
    <div style={{ minHeight: '100vh' }}>

      <main style={{ maxWidth: 980, margin: '0 auto', padding: 'clamp(28px,4vw,44px) clamp(20px,4vw,32px) 80px' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: 'clamp(1.5rem,3vw,1.9rem)', fontWeight: 600, letterSpacing: '-.02em' }}>
            自分の単価に入れ替える
          </h1>
          <span className="hb-badge">実データ {verifiedCount} / {WORK_ITEMS.length} 件</span>
        </div>
        <p className="hb-muted" style={{ marginTop: 12, fontSize: 14.5, lineHeight: 1.85, maxWidth: '40em' }}>
          初期値はすべて「参考値・要検証」の仮の数字です。ご自身の積算シートや物価資料の数字を入れると、
          その項目は「実データ」として扱われ、見積の注記も変わります。
        </p>

        <div className="hb-panel" style={{ marginTop: 24 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <button onClick={download} className="hb-btn hb-outline">テンプレートCSVを取得</button>
            <button onClick={() => fileRef.current?.click()} className="hb-btn hb-cta">CSVを取り込む</button>
            <input
              ref={fileRef} type="file" accept=".csv,text/csv" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void load(f); e.target.value = ''; }}
            />
            {Object.keys(priceBook).length > 0 && (
              <button
                onClick={() => { useEditor.getState().setPriceBook({}); setMsg('取り込んだ単価を消しました。'); setErrors([]); }}
                className="hb-btn hb-outline"
              >
                取り込みを取り消す
              </button>
            )}
          </div>
          <p className="hb-faint" style={{ fontSize: 12, marginTop: 10, lineHeight: 1.8 }}>
            列は <code>id, name, low, high, source</code>。<code>id</code> と <code>low</code>／<code>high</code> だけ合っていれば読み込めます。
            金額はカンマ・¥入りでも大丈夫です。
          </p>
          {msg && <p style={{ fontSize: 13, marginTop: 10 }}>{msg}</p>}
          {errors.length > 0 && (
            <div className="hb-warn" style={{ marginTop: 10 }}>
              <b>読み飛ばした行があります</b>
              <ul style={{ marginTop: 6, paddingLeft: '1.2em' }}>
                {errors.slice(0, 8).map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          )}
        </div>

        <table style={{ width: '100%', marginTop: 28, borderCollapse: 'collapse', fontSize: 13.5 }}>
          <thead>
            <tr style={{ background: 'var(--sunken)' }}>
              <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>工事項目</th>
              <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>単位</th>
              <th style={{ textAlign: 'right', padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>材料単価</th>
              <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>状態</th>
            </tr>
          </thead>
          <tbody>
            {items.map((w) => (
              <tr key={w.id}>
                <td style={{ padding: '7px 10px', borderBottom: '1px solid var(--border-soft)' }}>
                  {w.name}
                  <span className="hb-faint" style={{ marginLeft: 8, fontSize: 11 }}>{w.id}</span>
                </td>
                <td style={{ padding: '7px 10px', borderBottom: '1px solid var(--border-soft)' }}>{w.unit}</td>
                <td className="num" style={{ padding: '7px 10px', borderBottom: '1px solid var(--border-soft)', textAlign: 'right' }}>
                  {w.materialUnitPrice.low.toLocaleString()}–{w.materialUnitPrice.high.toLocaleString()}
                </td>
                <td style={{ padding: '7px 10px', borderBottom: '1px solid var(--border-soft)' }}>
                  {w.materialUnitPrice.verified ? (
                    <span className="hb-badge" style={{ background: '#e8f3ec', borderColor: '#b9dcc8', color: '#2f7a58' }}>実データ</span>
                  ) : (
                    <span className="hb-badge">参考値・要検証</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </main>
    </div>
  );
}
