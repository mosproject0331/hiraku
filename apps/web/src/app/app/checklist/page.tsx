'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { COMMON_VIEWING, USE_LABEL, USE_VIEWING, type ChecklistItem, type DesiredUse } from '@hiraku/rules';
import type { CheckState } from '@hiraku/core';
import { useEditor } from '@/lib/store';
import { deletePhoto, getPhotos, PhotoQuotaError, putPhoto, storageUse } from '@/lib/photo-store';
import { toStorableDataUrl } from '@/lib/video-frames';

/**
 * 内見チェックリスト。
 *
 * 現場では片手で、手袋のままでも押せることが大事なので、
 * 三択のボタンを大きく取り、記録はその場で端末に保存する（通信は要らない）。
 */

const STATES: { id: CheckState; label: string; mark: string }[] = [
  { id: 'ok', label: '問題なし', mark: '○' },
  { id: 'watch', label: '気になる', mark: '△' },
  { id: 'bad', label: '要対応', mark: '×' },
];

type Filter = 'all' | 'todo' | 'flagged';

interface Row extends ChecklistItem {
  group: string;
  custom?: string;
}

export default function ChecklistPage() {
  const projectName = useEditor((s) => s.projectName);
  const diagnosedUse = useEditor((s) => s.lastDiagnosis?.input.desiredUse);
  const pickedUse = useEditor((s) => s.checkUse);
  const setCheckUse = useEditor((s) => s.setCheckUse);
  const use = diagnosedUse ?? pickedUse ?? undefined;
  const checklist = useEditor((s) => s.checklist);
  const customChecks = useEditor((s) => s.customChecks);
  const setCheck = useEditor((s) => s.setCheck);
  const setCheckMemo = useEditor((s) => s.setCheckMemo);
  const addCheckPhoto = useEditor((s) => s.addCheckPhoto);
  const removeCheckPhoto = useEditor((s) => s.removeCheckPhoto);
  const addCustomCheck = useEditor((s) => s.addCustomCheck);
  const removeCustomCheck = useEditor((s) => s.removeCustomCheck);

  const [filter, setFilter] = useState<Filter>('all');
  const [openWhy, setOpenWhy] = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [storeMsg, setStoreMsg] = useState('');
  const [space, setSpace] = useState<{ usedMb: number; quotaMb: number } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = COMMON_VIEWING.map((c) => ({ ...c, group: '共通で見るところ' }));
    if (use && USE_VIEWING[use]) {
      const g = `${USE_LABEL[use]}で見るところ`;
      for (const c of USE_VIEWING[use]) out.push({ ...c, group: g });
    }
    for (const c of customChecks) {
      out.push({ label: c.label, why: '現場で足した項目', group: '自分で足した項目', custom: c.id });
    }
    return out;
  }, [use, customChecks]);

  const counts = useMemo(() => {
    let ok = 0;
    let watch = 0;
    let bad = 0;
    for (const r of rows) {
      const s = checklist[r.label]?.state;
      if (s === 'ok') ok++;
      else if (s === 'watch') watch++;
      else if (s === 'bad') bad++;
    }
    return { ok, watch, bad, done: ok + watch + bad, total: rows.length };
  }, [rows, checklist]);

  const shown = rows.filter((r) => {
    const s = checklist[r.label]?.state;
    if (filter === 'todo') return !s;
    if (filter === 'flagged') return s === 'watch' || s === 'bad';
    return true;
  });

  const groups = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of shown) {
      const list = m.get(r.group);
      if (list) list.push(r);
      else m.set(r.group, [r]);
    }
    return [...m.entries()];
  }, [shown]);

  const jumpToNext = useCallback(() => {
    const next = rows.find((r) => !checklist[r.label]?.state);
    if (!next) return;
    const el = listRef.current?.querySelector(`[data-key="${CSS.escape(next.label)}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [rows, checklist]);

  async function onPickPhoto(label: string, files: FileList | null) {
    if (!files?.length) return;
    setBusy(label);
    setStoreMsg('');
    try {
      for (const f of Array.from(files).slice(0, 4)) {
        const url = await toStorableDataUrl(f, 1280, 0.78);
        const id = `ph-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
        await putPhoto(id, url);
        addCheckPhoto(label, id);
      }
      setSpace(await storageUse());
    } catch (e) {
      // 入りきらないときは、黙って落とさずに逃げ道を示す
      setStoreMsg(
        e instanceof PhotoQuotaError
          ? 'この端末の保存領域がいっぱいです。調査書に書き出してから、古い写真を消してください。'
          : '写真を保存できませんでした。もう一度お試しください。',
      );
    } finally {
      setBusy(null);
    }
  }

  const pct = counts.total ? Math.round((counts.done / counts.total) * 100) : 0;

  return (
    <main className="chk">
      <header className="chk-head">
        <div className="chk-head-top">
          <div>
            <p className="chk-kicker">内見チェック</p>
            <h1 className="chk-title">{projectName || '無題の物件'}</h1>
          </div>
          <Link href="/app/survey" className="chk-linkbtn">調査書へ</Link>
        </div>

        <div className="chk-progress" role="img" aria-label={`${counts.total}件中${counts.done}件を記録`}>
          <div className="chk-bar"><span style={{ width: `${pct}%` }} /></div>
          <div className="chk-tally">
            <b>{counts.done}</b>/{counts.total}
            <span className="t-ok">○{counts.ok}</span>
            <span className="t-watch">△{counts.watch}</span>
            <span className="t-bad">×{counts.bad}</span>
          </div>
        </div>

        <div className="chiprow">
          {([['all', 'すべて'], ['todo', `未 ${counts.total - counts.done}`], ['flagged', `要確認 ${counts.watch + counts.bad}`]] as const).map(
            ([id, label]) => (
              <button
                key={id}
                className={'chip' + (filter === id ? ' on' : '')}
                onClick={() => setFilter(id)}
              >
                {label}
              </button>
            ),
          )}
        </div>
      </header>

      {storeMsg && <p className="hb-warn chk-storemsg">{storeMsg}</p>}

      <div className="chk-list" ref={listRef}>
        {!diagnosedUse && (
          <section className="chk-usepick">
            <h2 className="chk-group">何に使うつもりか（選ぶと見る項目が増えます）</h2>
            <div className="chiprow">
              {(Object.keys(USE_LABEL) as DesiredUse[]).map((u) => (
                <button
                  key={u}
                  className={'chip' + (pickedUse === u ? ' on' : '')}
                  onClick={() => setCheckUse(pickedUse === u ? null : u)}
                >
                  {USE_LABEL[u]}
                </button>
              ))}
            </div>
          </section>
        )}
        {groups.map(([group, items]) => (
          <section key={group}>
            <h2 className="chk-group">{group}</h2>
            {items.map((r) => {
              const entry = checklist[r.label];
              const why = openWhy === r.label;
              return (
                <article key={r.label} data-key={r.label} className={'chk-item s-' + (entry?.state ?? 'none')}>
                  <button className="chk-label" onClick={() => setOpenWhy(why ? null : r.label)}>
                    <span>{r.label}</span>
                    <span className="chk-why-mark" aria-hidden>{why ? '−' : 'なぜ'}</span>
                  </button>
                  {why && <p className="chk-why">{r.why}</p>}

                  <div className="chk-states" role="group" aria-label={r.label}>
                    {STATES.map((s) => (
                      <button
                        key={s.id}
                        className={'chk-state st-' + s.id + (entry?.state === s.id ? ' on' : '')}
                        aria-pressed={entry?.state === s.id}
                        onClick={() => setCheck(r.label, entry?.state === s.id ? null : s.id)}
                      >
                        <b>{s.mark}</b>
                        <em>{s.label}</em>
                      </button>
                    ))}
                  </div>

                  {entry?.state && (
                    <div className="chk-detail">
                      <input
                        className="chk-memo"
                        value={entry.memo}
                        placeholder="気づいたこと（場所・程度・寸法など）"
                        onChange={(e) => setCheckMemo(r.label, e.target.value)}
                      />
                      <div className="chk-photos">
                        <label className="chk-shoot">
                          {busy === r.label ? '取り込み中…' : '写真'}
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            multiple
                            hidden
                            onChange={(e) => {
                              void onPickPhoto(r.label, e.target.files);
                              e.currentTarget.value = '';
                            }}
                          />
                        </label>
                        <Thumbs
                          ids={entry.photos}
                          onRemove={(id) => {
                            removeCheckPhoto(r.label, id);
                            void deletePhoto(id);
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {r.custom && (
                    <button className="chk-remove" onClick={() => removeCustomCheck(r.custom!)}>
                      この項目を消す
                    </button>
                  )}
                </article>
              );
            })}
          </section>
        ))}

        <section className="chk-add">
          <h2 className="chk-group">見ておきたいことを足す</h2>
          <div className="chk-addrow">
            <input
              className="chk-memo"
              value={newLabel}
              placeholder="例: 井戸のポンプが動くか"
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  addCustomCheck(newLabel);
                  setNewLabel('');
                }
              }}
            />
            <button
              className="hb-btn hb-dark"
              onClick={() => {
                addCustomCheck(newLabel);
                setNewLabel('');
              }}
            >
              足す
            </button>
          </div>
        </section>

        <p className="chk-note">
          記録はこの端末の中だけに保存されます。電波がなくても使えます。
          写真は長辺1280pxに縮めて保存します。
          {space && (
            <>
              {' '}いま <b className="num">{space.usedMb.toFixed(0)}MB</b> / 使える{' '}
              <b className="num">{space.quotaMb.toFixed(0)}MB</b>。
            </>
          )}
        </p>
      </div>

      <div className="chk-foot">
        <button className="hb-btn hb-outline" onClick={jumpToNext} disabled={counts.done >= counts.total}>
          次の未チェックへ
        </button>
        <Link href="/app/survey" className="hb-btn hb-cta">調査書に反映</Link>
      </div>
    </main>
  );
}

/** 保存した写真の見出し画像。IndexedDB から読み出す */
function Thumbs({ ids, onRemove }: { ids: string[]; onRemove: (id: string) => void }) {
  const [urls, setUrls] = useState<(string | undefined)[]>([]);
  useEffect(() => {
    let alive = true;
    void getPhotos(ids).then((v) => {
      if (alive) setUrls(v);
    });
    return () => {
      alive = false;
    };
  }, [ids]);
  return (
    <>
      {ids.map((id, i) => (
        <span key={id} className="chk-thumb">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {urls[i] ? <img src={urls[i]} alt="現場の写真" /> : <span className="chk-thumb-wait" />}
          <button onClick={() => onRemove(id)} aria-label="この写真を消す">×</button>
        </span>
      ))}
    </>
  );
}
