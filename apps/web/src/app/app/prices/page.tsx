'use client';

import { useMemo, useRef, useState } from 'react';
import {
  applyPriceBook, BASIS_LABEL, BASIS_NOTE, estimatePlan, parsePriceCsv, priceTemplateCsv,
  WORK_ITEMS, type PriceBasis, type WorkItem,
} from '@hiraku/estimate';
import { opsOf } from '@hiraku/proposal';
import { jp } from '@/components/Jp';
import { useEditor } from '@/lib/store';

/**
 * 単価帳。
 *
 * 全国一律の「正しい単価」は存在しない。ホームセンターの値段でさえ店舗で違う。
 * だからこの道具は数字を当てにいかず、**出どころを持てる形**だけを用意して、
 * 使う人の数字が入ったときに初めて「確かな数字」として扱う。
 *
 * 41件を全部埋めるのは現実的でないので、いまの案でいちばん金額が動く順に並べる。
 */

const yen = (n: number) => n.toLocaleString('ja-JP');

export default function PricesPage() {
  const priceBook = useEditor((s) => s.priceBook);
  const setPriceBook = useEditor((s) => s.setPriceBook);
  const model = useEditor((s) => s.model);
  const proposals = useEditor((s) => s.proposals);
  const fileRef = useRef<HTMLInputElement>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [msg, setMsg] = useState('');
  const [order, setOrder] = useState<'impact' | 'category'>('impact');
  const [onlyTodo, setOnlyTodo] = useState(false);

  const items = useMemo(() => applyPriceBook(priceBook), [priceBook]);
  const verified = items.filter((w) => w.materialUnitPrice.verified);
  const mineCount = Object.keys(priceBook).length;

  /** いまの案で、どの項目がどれだけ金額を動かすか */
  const impact = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of proposals) {
      try {
        for (const l of estimatePlan(model, opsOf(p), priceBook).lines) {
          m.set(l.itemId, Math.max(m.get(l.itemId) ?? 0, l.highYen - l.lowYen));
        }
      } catch {
        /* 案がこの間取りに合わないときは飛ばす */
      }
    }
    return m;
  }, [proposals, model, priceBook]);

  const shown = useMemo(() => {
    const list = items.filter((w) => (onlyTodo ? !w.materialUnitPrice.verified : true));
    if (order === 'impact') {
      return [...list].sort(
        (a, b) =>
          (impact.get(b.id) ?? -1) - (impact.get(a.id) ?? -1) ||
          Number(a.materialUnitPrice.verified) - Number(b.materialUnitPrice.verified) ||
          a.category.localeCompare(b.category, 'ja'),
      );
    }
    return [...list].sort(
      (a, b) => a.category.localeCompare(b.category, 'ja') || a.name.localeCompare(b.name, 'ja'),
    );
  }, [items, order, impact, onlyTodo]);

  const used = shown.filter((w) => impact.has(w.id)).length;

  function set(id: string, patch: { low?: number; high?: number; source?: string; asOf?: string }) {
    const base = items.find((w) => w.id === id)!;
    const cur = priceBook[id];
    const low = patch.low ?? cur?.low ?? base.materialUnitPrice.low;
    const high = patch.high ?? cur?.high ?? base.materialUnitPrice.high;
    setPriceBook({
      ...priceBook,
      [id]: {
        id,
        low,
        high,
        source: patch.source ?? cur?.source,
        asOf: patch.asOf ?? cur?.asOf,
        basis: cur?.basis,
      },
    });
  }

  function clearOne(id: string) {
    const next = { ...priceBook };
    delete next[id];
    setPriceBook(next);
  }

  function download() {
    const blob = new Blob([priceTemplateCsv(priceBook)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'hiraku-単価帳.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  async function load(file: File) {
    const { book, errors } = parsePriceCsv(await file.text());
    setErrors(errors);
    const n = Object.keys(book).length;
    if (n) {
      setPriceBook({ ...priceBook, ...book });
      setMsg(`${n}件を取り込みました。以降の概算と見積書に反映されます。`);
    } else {
      setMsg('取り込める行がありませんでした。');
    }
  }

  const pct = Math.round((verified.length / WORK_ITEMS.length) * 100);

  return (
    <main className="plan prices">
      <header>
        <p className="intake-kicker">単価帳</p>
        <h1 className="intake-title">{jp('その数字は、どこから来ましたか。')}</h1>
        <p className="intake-sub">
          {jp('全国一律の正しい単価はありません。同じ石膏ボードでも、ホームセンターは482円/㎡、積算資料の公表価格は1,177円/㎡です。よく出る項目は実売を調べて、店名と時点を添えてあります。それでもあなたの現場の数字にはかないません。上書きしてください。')}
        </p>
        <div className="intake-bar"><span style={{ width: `${pct}%` }} /></div>
        <p className="prices-count">
          <b className="num">{verified.length}</b> / {WORK_ITEMS.length} 件は出どころが分かる数字
          {mineCount > 0 && <>（うち <b className="num">{mineCount}</b> 件はあなたが入れたもの）</>}
          {proposals.length > 0 && <> ／ いまの案で使うのは <b className="num">{impact.size}</b> 件</>}
        </p>
      </header>

      <section className="prices-bar no-print">
        <div className="chiprow">
          <button className={'chip' + (order === 'impact' ? ' on' : '')} onClick={() => setOrder('impact')}>
            効く順
          </button>
          <button className={'chip' + (order === 'category' ? ' on' : '')} onClick={() => setOrder('category')}>
            分類順
          </button>
          <span className="chipgap" />
          <button className={'chip' + (onlyTodo ? ' on' : '')} onClick={() => setOnlyTodo((v) => !v)}>
            未入力だけ
          </button>
        </div>
        <div className="prices-io">
          <button onClick={download} className="hb-btn hb-outline">CSVで書き出す</button>
          <button onClick={() => fileRef.current?.click()} className="hb-btn hb-outline">CSVを取り込む</button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void load(f); e.target.value = ''; }} />
          {Object.keys(priceBook).length > 0 && (
            <button className="hb-btn hb-outline" onClick={() => { setPriceBook({}); setMsg('自分の単価をすべて消しました。'); }}>
              全部戻す
            </button>
          )}
        </div>
        {msg && <p className="prices-msg">{msg}</p>}
        {errors.length > 0 && (
          <ul className="hb-warn prices-err">{errors.slice(0, 6).map((e, i) => <li key={i}>{e}</li>)}</ul>
        )}
      </section>

      {order === 'impact' && proposals.length === 0 && (
        <p className="prices-hint">
          改修案をつくると、いまの物件で金額がいちばん動く項目から並びます。
          全部を埋める必要はありません。
        </p>
      )}
      {order === 'impact' && used > 0 && (
        <p className="prices-hint">
          上の <b>{used}</b> 件が、いまの案に出てくる項目です。ここだけ埋めれば概算はぐっと確かになります。
        </p>
      )}

      <div className="prices-list">
        {shown.map((w) => (
          <Row
            key={w.id}
            w={w}
            inPlan={impact.has(w.id)}
            mine={Boolean(priceBook[w.id])}
            onSet={set}
            onClear={clearOne}
          />
        ))}
      </div>

      <p className="plan-note">
        入れた数字は、この端末の中だけに残ります。CSVで書き出して、次の物件でも使えます。
      </p>
    </main>
  );
}

function Row({
  w, inPlan, mine, onSet, onClear,
}: {
  w: WorkItem;
  inPlan: boolean;
  /** 使う人が自分で入れた数字か（調べただけの数字と区別する） */
  mine: boolean;
  onSet: (id: string, patch: { low?: number; high?: number; source?: string; asOf?: string }) => void;
  onClear: (id: string) => void;
}) {
  const p = w.materialUnitPrice;
  const [open, setOpen] = useState(false);
  return (
    <article className={'price' + (p.verified ? ' is-mine' : '') + (inPlan ? ' in-plan' : '')}>
      <div className="price-top">
        <div className="price-id">
          <h3>{w.name}</h3>
          <p>
            <span className="price-cat">{w.category}</span>
            <span className={'price-basis b-' + p.basis} title={BASIS_NOTE[p.basis]}>
              {BASIS_LABEL[p.basis]}
            </span>
            {inPlan && <span className="price-inplan">いまの案で使う</span>}
          </p>
        </div>
        <div className="price-nums">
          <label>
            <input
              type="number" inputMode="numeric" value={p.low}
              onChange={(e) => onSet(w.id, { low: Number(e.target.value) || 0 })}
            />
          </label>
          <span className="price-tilde">〜</span>
          <label>
            <input
              type="number" inputMode="numeric" value={p.high}
              onChange={(e) => onSet(w.id, { high: Number(e.target.value) || 0 })}
            />
          </label>
          <span className="price-unit">円/{w.unit}</span>
        </div>
      </div>

      <div className="price-meta">
        <span className={p.verified ? 'price-src mine' : 'price-src'}>
          {mine ? '自分の数字' : p.verified ? '調べた数字' : '未検証'} — {p.source}
          {p.asOf && <> ／ {p.asOf}</>}
        </span>
        <button className="price-more" onClick={() => setOpen((v) => !v)}>
          {open ? '閉じる' : '出どころを書く'}
        </button>
      </div>

      {open && (
        <div className="price-edit">
          <label className="numpad-field">
            <span>出どころ</span>
            <input
              value={p.verified ? p.source : ''}
              placeholder="例: ○○建材 見積 / 前回の現場"
              onChange={(e) => onSet(w.id, { source: e.target.value })}
            />
          </label>
          <label className="numpad-field">
            <span>時点</span>
            <input
              value={p.asOf ?? ''}
              placeholder="2026-08"
              onChange={(e) => onSet(w.id, { asOf: e.target.value })}
            />
          </label>
          {p.verified && (
            <button className="qt-op danger" onClick={() => onClear(w.id)}>初期値に戻す</button>
          )}
          <p className="price-note">{BASIS_NOTE[p.basis]}</p>
        </div>
      )}
    </article>
  );
}
