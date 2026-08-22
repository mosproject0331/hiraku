'use client';

import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  lineAmount, quoteCsv, quoteTotals, renderQuote, untouchedLines,
  type QuoteDoc, type QuoteLine, type QuoteParty, type TaxMode,
} from '@hiraku/report';
import { useEditor } from '@/lib/store';
import { emptyLine, headingLine, linesFromPlan, loadIssuer, newQuote, saveIssuer } from '@/lib/quote-build';

/**
 * 御見積書。
 *
 * 相手にそのまま渡せる書式を保ちながら、どの数字もその場で直せることを狙う。
 * 計算は @hiraku/report 側に寄せ、この画面は入力と受け渡しだけを持つ。
 */

const yen = (n: number) => '¥' + Math.round(n).toLocaleString('ja-JP');

export default function QuotePage() {
  const quote = useEditor((s) => s.quote);
  const setQuote = useEditor((s) => s.setQuote);
  const patchQuote = useEditor((s) => s.patchQuote);
  const model = useEditor((s) => s.model);
  const plans = useEditor((s) => s.lastPlans);
  const priceBook = useEditor((s) => s.priceBook);
  const projectName = useEditor((s) => s.projectName);
  const address = useEditor((s) => s.lastDiagnosis?.input.address);

  const [tab, setTab] = useState<'edit' | 'preview'>('edit');
  const [open, setOpen] = useState<string | null>('client');
  const printRef = useRef<HTMLIFrameElement>(null);

  // はじめて開いたときに、案件の情報でたたき台をつくる
  useEffect(() => {
    if (quote) return;
    setQuote(newQuote({ subject: projectName ? `${projectName} 改修工事` : '空き家改修工事', site: address }));
  }, [quote, setQuote, projectName, address]);

  const doc = quote;
  const totals = useMemo(() => (doc ? quoteTotals(doc) : null), [doc]);
  const untouched = useMemo(() => (doc ? untouchedLines(doc) : []), [doc]);
  // 打っている最中にA4を組み直すと重い。少し遅らせて後から追いつかせる
  const deferred = useDeferredValue(doc);
  const html = useMemo(() => (deferred ? renderQuote(deferred) : ''), [deferred]);

  if (!doc || !totals) return null;

  const setLines = (lines: QuoteLine[]) => patchQuote({ lines });
  const patchLine = (id: string, p: Partial<QuoteLine>) =>
    setLines(doc.lines.map((l) => (l.id === id ? { ...l, ...p } : l)));
  const move = (i: number, d: -1 | 1) => {
    const next = [...doc.lines];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j]!, next[i]!];
    setLines(next);
  };

  function importFromPlan(index: number) {
    const p = plans?.[index];
    if (!p) return;
    const lines = linesFromPlan(model, p.ops, priceBook, 'mid');
    setLines([...doc!.lines, ...lines]);
    patchQuote({ subject: doc!.subject || `${p.name} 改修工事` });
  }

  function download(name: string, text: string, type: string) {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function print() {
    const f = printRef.current;
    if (!f?.contentWindow) return;
    f.contentWindow.focus();
    f.contentWindow.print();
  }

  return (
    <main className="qt">
      <h1 className="sr-only">御見積書をつくる</h1>
      <header className="qt-bar">
        <div className="qt-tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'edit'} className={'chip' + (tab === 'edit' ? ' on' : '')} onClick={() => setTab('edit')}>編集</button>
          <button role="tab" aria-selected={tab === 'preview'} className={'chip' + (tab === 'preview' ? ' on' : '')} onClick={() => setTab('preview')}>できあがり</button>
        </div>
        <div className="qt-actions">
          <button className="hb-btn hb-outline" onClick={() => download(`見積_${doc.no}.csv`, quoteCsv(doc), 'text/csv;charset=utf-8')}>CSV</button>
          <button className="hb-btn hb-outline" onClick={() => download(`見積_${doc.no}.html`, html, 'text/html;charset=utf-8')}>保存</button>
          <button className="hb-btn hb-cta" onClick={print}>印刷 / PDF</button>
        </div>
      </header>

      {untouched.length > 0 && (
        <p className="qt-warn">
          {untouched.length}件が取り込んだままの参考単価です。出す前に自分の単価に直してください。
        </p>
      )}

      <div className={'qt-body tab-' + tab}>
        <section className="qt-edit">
          <Fold id="client" open={open} setOpen={setOpen} title="宛先と件名">
            <Grid>
              <F label="宛名"><input className="qt-in" value={doc.clientName} onChange={(e) => patchQuote({ clientName: e.target.value })} placeholder="奥野 太郎" /></F>
              <F label="敬称" narrow>
                <select className="qt-in" value={doc.clientHonorific} onChange={(e) => patchQuote({ clientHonorific: e.target.value as '御中' | '様' })}>
                  <option value="様">様</option>
                  <option value="御中">御中</option>
                </select>
              </F>
              <F label="件名" wide><input className="qt-in" value={doc.subject} onChange={(e) => patchQuote({ subject: e.target.value })} /></F>
              <F label="工事場所" wide><input className="qt-in" value={doc.site ?? ''} onChange={(e) => patchQuote({ site: e.target.value })} /></F>
              <F label="見積番号"><input className="qt-in" value={doc.no} onChange={(e) => patchQuote({ no: e.target.value })} /></F>
              <F label="発行日"><input type="date" className="qt-in" value={doc.issuedOn} onChange={(e) => patchQuote({ issuedOn: e.target.value })} /></F>
              <F label="有効期限"><input type="date" className="qt-in" value={doc.validUntil ?? ''} onChange={(e) => patchQuote({ validUntil: e.target.value })} /></F>
              <F label="工期"><input className="qt-in" value={doc.period ?? ''} onChange={(e) => patchQuote({ period: e.target.value })} placeholder="着工より約6週間" /></F>
              <F label="支払条件" wide><input className="qt-in" value={doc.payment ?? ''} onChange={(e) => patchQuote({ payment: e.target.value })} /></F>
            </Grid>
          </Fold>

          <Fold id="lines" open={open} setOpen={setOpen} title={`明細 (${doc.lines.filter((l) => !l.heading).length}件)`}>
            {plans?.length ? (
              <div className="chiprow">
                <span className="qt-hint">改修案から取り込む</span>
                {plans.map((p, i) => (
                  <button key={i} className="chip" onClick={() => importFromPlan(i)}>{p.name}</button>
                ))}
              </div>
            ) : null}

            <div className="qt-lines">
              {doc.lines.map((l, i) => (
                <div key={l.id} className={'qt-line' + (l.heading ? ' is-head' : '') + (l.tbd ? ' is-tbd' : '')}>
                  <div className="qt-line-top">
                    <span className="qt-no">{l.heading ? '—' : i + 1}</span>
                    <input
                      className="qt-in qt-name"
                      value={l.name}
                      placeholder={l.heading ? '区分の見出し' : '品名'}
                      onChange={(e) => patchLine(l.id, { name: e.target.value })}
                    />
                    <span className="qt-amount">{l.heading ? '' : l.tbd ? '別途' : yen(lineAmount(l))}</span>
                  </div>

                  {!l.heading && (
                    <>
                      <input className="qt-in qt-spec" value={l.spec ?? ''} placeholder="仕様・摘要" onChange={(e) => patchLine(l.id, { spec: e.target.value })} />
                      <div className="qt-nums">
                        <label>数量<input type="number" inputMode="decimal" className="qt-in" value={l.qty} disabled={l.tbd} onChange={(e) => patchLine(l.id, { qty: Number(e.target.value) })} /></label>
                        <label>単位<input className="qt-in" value={l.unit} disabled={l.tbd} onChange={(e) => patchLine(l.id, { unit: e.target.value })} /></label>
                        <label>単価<input type="number" inputMode="numeric" className="qt-in" value={l.unitPrice} disabled={l.tbd} onChange={(e) => patchLine(l.id, { unitPrice: Number(e.target.value), edited: true })} /></label>
                      </div>
                      {l.fromRange && !l.edited && (
                        <p className="qt-range">参考レンジ {yen(l.fromRange.low)}〜{yen(l.fromRange.high)}（自分の単価に直してください）</p>
                      )}
                      <input className="qt-in qt-note" value={l.note ?? ''} placeholder="備考" onChange={(e) => patchLine(l.id, { note: e.target.value })} />
                    </>
                  )}

                  <div className="qt-line-ops">
                    {!l.heading && (
                      <button className={'qt-op' + (l.tbd ? ' on' : '')} onClick={() => patchLine(l.id, { tbd: !l.tbd })}>別途</button>
                    )}
                    <button className="qt-op" onClick={() => move(i, -1)} aria-label="上へ">↑</button>
                    <button className="qt-op" onClick={() => move(i, 1)} aria-label="下へ">↓</button>
                    <button className="qt-op danger" onClick={() => setLines(doc.lines.filter((x) => x.id !== l.id))}>削除</button>
                  </div>
                </div>
              ))}
            </div>

            <div className="qt-addrow">
              <button className="hb-btn hb-outline" onClick={() => setLines([...doc.lines, emptyLine()])}>行を足す</button>
              <button className="hb-btn hb-outline" onClick={() => setLines([...doc.lines, headingLine('')])}>見出しを足す</button>
            </div>
          </Fold>

          <Fold id="total" open={open} setOpen={setOpen} title={`合計 ${yen(totals.total)}`}>
            <Grid>
              <F label="諸経費の名前"><input className="qt-in" value={doc.overheadLabel} onChange={(e) => patchQuote({ overheadLabel: e.target.value })} /></F>
              <F label="諸経費 %"><input type="number" inputMode="decimal" className="qt-in" value={doc.overheadPct} onChange={(e) => patchQuote({ overheadPct: Number(e.target.value) })} /></F>
              <F label="値引き"><input type="number" inputMode="numeric" className="qt-in" value={doc.discount} onChange={(e) => patchQuote({ discount: Number(e.target.value) })} /></F>
              <F label="消費税">
                <select className="qt-in" value={doc.taxMode} onChange={(e) => patchQuote({ taxMode: e.target.value as TaxMode })}>
                  <option value="exclusive">外税</option>
                  <option value="inclusive">内税</option>
                  <option value="none">対象外</option>
                </select>
              </F>
              <F label="税率">
                <select className="qt-in" value={String(doc.taxRate)} onChange={(e) => patchQuote({ taxRate: Number(e.target.value) })}>
                  <option value="0.1">10%</option>
                  <option value="0.08">8%</option>
                  <option value="0">0%</option>
                </select>
              </F>
              <F label="端数">
                <select className="qt-in" value={doc.taxRounding} onChange={(e) => patchQuote({ taxRounding: e.target.value as 'floor' | 'round' | 'ceil' })}>
                  <option value="floor">切り捨て</option>
                  <option value="round">四捨五入</option>
                  <option value="ceil">切り上げ</option>
                </select>
              </F>
              <F label="備考" wide>
                <textarea className="qt-in qt-area" rows={3} value={doc.notes} onChange={(e) => patchQuote({ notes: e.target.value })} placeholder="別途工事・前提条件など" />
              </F>
            </Grid>
            <label className="qt-check">
              <input type="checkbox" checked={doc.provisional} onChange={(e) => patchQuote({ provisional: e.target.checked })} />
              概算であることを本紙に書く
            </label>
            <dl className="qt-sum">
              <div><dt>小計</dt><dd>{yen(totals.subtotal)}</dd></div>
              {doc.overheadPct ? <div><dt>{doc.overheadLabel}</dt><dd>{yen(totals.overhead)}</dd></div> : null}
              {totals.discount ? <div><dt>値引</dt><dd>-{yen(totals.discount)}</dd></div> : null}
              <div><dt>消費税</dt><dd>{yen(totals.tax)}</dd></div>
              <div className="tot"><dt>合計</dt><dd>{yen(totals.total)}</dd></div>
            </dl>
          </Fold>

          <Fold id="from" open={open} setOpen={setOpen} title="自社情報（次回も使えます）">
            <IssuerForm value={doc.from} onChange={(from) => { patchQuote({ from }); saveIssuer(from); }} />
          </Fold>
        </section>

        <section className="qt-preview">
          <iframe ref={printRef} title="御見積書のできあがり" srcDoc={html} />
        </section>
      </div>
    </main>
  );
}

function Fold({
  id, title, open, setOpen, children,
}: {
  id: string; title: string; open: string | null;
  setOpen: (v: string | null) => void; children: React.ReactNode;
}) {
  const on = open === id;
  return (
    <section className={'qt-fold' + (on ? ' on' : '')}>
      <button className="qt-foldhead" onClick={() => setOpen(on ? null : id)} aria-expanded={on}>
        <span>{title}</span>
        <span aria-hidden>{on ? '−' : '＋'}</span>
      </button>
      {on && <div className="qt-foldbody">{children}</div>}
    </section>
  );
}

const Grid = ({ children }: { children: React.ReactNode }) => <div className="qt-grid">{children}</div>;

function F({ label, children, wide, narrow }: { label: string; children: React.ReactNode; wide?: boolean; narrow?: boolean }) {
  return (
    <label className={'qt-f' + (wide ? ' wide' : '') + (narrow ? ' narrow' : '')}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function IssuerForm({ value, onChange }: { value: QuoteParty; onChange: (p: QuoteParty) => void }) {
  const [v, setV] = useState<QuoteParty>(value);
  useEffect(() => {
    // 保存済みの自社情報があれば、空の見積に引き継ぐ
    if (!value.name) {
      const saved = loadIssuer();
      if (saved.name) {
        setV(saved);
        onChange(saved);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const set = (p: Partial<QuoteParty>) => {
    const next = { ...v, ...p };
    setV(next);
    onChange(next);
  };
  return (
    <Grid>
      <F label="社名・屋号" wide><input className="qt-in" value={v.name} onChange={(e) => set({ name: e.target.value })} placeholder="ISHIZUE合同会社" /></F>
      <F label="郵便番号"><input className="qt-in" value={v.postal ?? ''} onChange={(e) => set({ postal: e.target.value })} /></F>
      <F label="住所" wide><input className="qt-in" value={v.address ?? ''} onChange={(e) => set({ address: e.target.value })} /></F>
      <F label="電話"><input className="qt-in" value={v.tel ?? ''} onChange={(e) => set({ tel: e.target.value })} /></F>
      <F label="メール"><input className="qt-in" value={v.email ?? ''} onChange={(e) => set({ email: e.target.value })} /></F>
      <F label="担当者"><input className="qt-in" value={v.person ?? ''} onChange={(e) => set({ person: e.target.value })} /></F>
      <F label="登録番号" wide><input className="qt-in" value={v.invoiceNo ?? ''} onChange={(e) => set({ invoiceNo: e.target.value })} placeholder="T1234567890123（インボイス）" /></F>
      <F label="社印の画像" wide>
        <div className="qt-seal">
          <label className="chk-shoot">
            画像を選ぶ
            <input type="file" accept="image/png,image/jpeg" hidden onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const r = new FileReader();
              r.onload = () => set({ sealDataUrl: String(r.result) });
              r.readAsDataURL(f);
            }} />
          </label>
          {v.sealDataUrl && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={v.sealDataUrl} alt="社印" />
              <button className="qt-op danger" onClick={() => set({ sealDataUrl: undefined })}>外す</button>
            </>
          )}
        </div>
      </F>
    </Grid>
  );
}
