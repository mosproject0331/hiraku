'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  applyFound, buildFrame, buildRenovationScene, frameTakeoff, interiorCameras,
  MEMBER_LABEL, MEMBER_ROLE, SPECIES_LABEL, wallLoad,
  type Member, type MemberFound, type Species,
} from '@hiraku/core';
import { detectTier, profileFor, type Tier } from '@/lib/quality';
import type { FrameView, SceneViewHandle } from '@/components/SceneView';
import { jp } from '@/components/Jp';
import { useEditor } from '@/lib/store';

const SceneView = dynamic(() => import('@/components/SceneView'), { ssr: false });

/**
 * 骨組み。
 *
 * 間取りだけでは、どこに手を入れられるかは決まらない。
 * 決めているのは、柱と梁と、それを繋いでいるものだ。
 *
 * ここが出すのは推定であって、構造の答えではない。
 * だから全部の部材に「なぜそこにあると考えたか」と「どう確かめるか」を付けている。
 * 見て確かめた分だけ、灰色が緑になる。
 */

const VIEWS: { id: FrameView; label: string; hint: string }[] = [
  { id: 'ghost', label: '透かして見る', hint: '壁の中の骨組みが見える' },
  { id: 'only', label: '骨組みだけ', hint: '仕上げを外して軸組だけ' },
  { id: 'off', label: '仕上げのまま', hint: 'ふだんの見え方' },
];

const STATES: { id: NonNullable<MemberFound['state']>; label: string }[] = [
  { id: 'ok', label: 'なんともない' },
  { id: 'watch', label: '気になる' },
  { id: 'bad', label: '傷んでいる' },
];

export default function FramePage() {
  const model = useEditor((s) => s.model);
  const levelIndex = useEditor((s) => s.levelIndex);
  const site = useEditor((s) => s.site);
  const found = useEditor((s) => s.frameFound);
  const setFound = useEditor((s) => s.setFound);
  const minka = useEditor((s) => s.frameMinka);
  const setMinka = useEditor((s) => s.setFrameMinka);

  const [view, setView] = useState<FrameView>('ghost');
  const [color, setColor] = useState<'role' | 'confidence'>('role');
  const [walk, setWalk] = useState(false);
  const [picked, setPicked] = useState<Member | null>(null);
  const [tier] = useState<Tier>(() => detectTier());
  const viewRef = useRef<SceneViewHandle>(null);
  /**
   * 置き場所の大きさが決まってから3Dを組む。
   *
   * 保存してある案件はあとから読み込まれるので、最初の一瞬は部屋が無く、
   * この枠自体が画面に無い。ref を待つ形にすると、その一瞬で取り逃がして
   * 二度と組まれない。だから callback ref で「置かれた瞬間」を受け取る。
   */
  const [ready, setReady] = useState(false);
  const offRef = useRef<(() => void) | null>(null);
  const boxRef = (el: HTMLDivElement | null) => {
    offRef.current?.();
    offRef.current = null;
    if (!el) return;
    const sized = () => el.clientWidth > 0 && el.clientHeight > 0;
    if (sized()) setReady(true);
    const ro = new ResizeObserver(() => { if (sized()) setReady(true); });
    ro.observe(el);
    offRef.current = () => ro.disconnect();
  };
  useEffect(() => () => offRef.current?.(), []);

  const li = Math.min(levelIndex, model.levels.length - 1);
  const scene = useMemo(() => buildRenovationScene(model, [], li), [model, li]);
  const frame = useMemo(
    () => applyFound(buildFrame(model, li, { minka }), found),
    [model, li, minka, found],
  );
  const quantities = useMemo(() => frameTakeoff(frame), [frame]);
  const cameras = useMemo(() => interiorCameras(model, 1, li), [model, li]);
  const quality = useMemo(() => profileFor(tier), [tier]);

  const totalM3 = quantities.reduce((s, q) => s + q.volumeM3, 0);
  const checked = frame.members.filter((m) => m.confidence === 'measured').length;
  const cam = cameras[0];

  const load = picked?.wallId ? wallLoad(frame, picked.wallId) : null;

  const record = (patch: Partial<MemberFound>) => {
    if (!picked) return;
    const now = { ...(picked.found ?? {}), ...patch, at: new Date().toISOString().slice(0, 10) };
    setFound(picked.id, now);
    setPicked({ ...picked, found: now, confidence: 'measured' });
  };

  return (
    <main className="plan frame-page">
      <p className="intake-kicker">骨組み</p>
      <h1 className="intake-title">{jp('この家は、どう組まれているか')}</h1>
      <p className="intake-sub">
        {jp(
          '間取りを測った寸法から、在来軸組として組み直したものです。実際に見たわけではないので、' +
          'ぜんぶ推定から始まります。床下や天井裏を覗いて確かめた分だけ、色が変わります。',
        )}
      </p>

      <div className="frame-bar no-print">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            className={view === v.id ? 'hb-btn hb-dark' : 'hb-btn hb-outline'}
            onClick={() => setView(v.id)}
            title={v.hint}
          >
            {v.label}
          </button>
        ))}
        <span className="frame-sep" />
        <button
          className={walk ? 'hb-btn hb-dark' : 'hb-btn hb-outline'}
          onClick={() => { setWalk((w) => !w); setPicked(null); }}
        >
          {walk ? '歩くのをやめる' : '中を歩く'}
        </button>
      </div>

      {cam ? (
        <div className="frame-view" ref={boxRef}>
          {ready && <SceneView
            key={walk ? 'walk' : 'still'}
            ref={viewRef}
            scene={scene}
            camera={cam}
            quality={quality}
            site={site}
            levelIndex={li}
            walk={walk}
            frame={frame.members}
            frameView={view}
            frameColor={color}
            selectedMemberId={picked?.id ?? null}
            onPickMember={(m) => setPicked(m)}
          />}
        </div>
      ) : (
        <p className="hb-warn">{jp('部屋が認識できていないため、骨組みを組めません。先に間取りを整えてください。')}</p>
      )}

      <div className="frame-legend no-print">
        <button
          className={color === 'role' ? 'frame-tab on' : 'frame-tab'}
          onClick={() => setColor('role')}
        >
          力の流れで見る
        </button>
        <button
          className={color === 'confidence' ? 'frame-tab on' : 'frame-tab'}
          onClick={() => setColor('confidence')}
        >
          確かめた度合いで見る
        </button>
        <div className="frame-keys">
          {color === 'role' ? (
            <>
              <span><i style={{ background: '#8a5a33' }} />立って持つもの</span>
              <span><i style={{ background: '#6b4326' }} />横に渡すもの</span>
              <span><i style={{ background: '#a8402c' }} />ゆがみを止めるもの</span>
              <span><i style={{ background: '#9b7a5e' }} />貫</span>
              <span><i style={{ background: '#c2a889' }} />下地</span>
            </>
          ) : (
            <>
              <span><i style={{ background: '#a8a29a' }} />推定（{frame.members.length - checked}）</span>
              <span><i style={{ background: '#2f7a58' }} />見て確かめた（{checked}）</span>
            </>
          )}
        </div>
      </div>

      {picked && (
        <section className="frame-pick">
          <div className="frame-pick-top">
            <h2>{MEMBER_LABEL[picked.kind]}</h2>
            <span className="frame-sec">
              {picked.section.w}×{picked.section.h}
              <em>{SPECIES_LABEL[picked.species]}</em>
            </span>
            <button className="frame-x" onClick={() => setPicked(null)} aria-label="閉じる">×</button>
          </div>
          <p className="frame-role">{MEMBER_ROLE[picked.kind]}</p>
          <p className="frame-why"><b>なぜここにあるか</b>{jp(picked.because)}</p>
          <p className="frame-how"><b>どう確かめるか</b>{jp(picked.howToCheck)}</p>
          {load && <p className="frame-load">{jp(load.verdict)}</p>}

          <div className="frame-record">
            <p className="frame-record-t">
              見てきたら入れてください。ここだけが「推定」を「実測」に変えられます。
            </p>
            <div className="chiprow">
              {STATES.map((st) => (
                <button
                  key={st.id}
                  className={picked.found?.state === st.id ? 'hb-chip on' : 'hb-chip'}
                  onClick={() => record({ state: st.id })}
                >
                  {st.label}
                </button>
              ))}
            </div>
            <div className="frame-fields">
              <label>
                実際の断面
                <span>
                  <input
                    type="number" inputMode="numeric" className="hb-field"
                    defaultValue={picked.section.w}
                    onBlur={(e) => record({ section: { w: Number(e.target.value) || picked.section.w, h: picked.found?.section?.h ?? picked.section.h } })}
                  />
                  ×
                  <input
                    type="number" inputMode="numeric" className="hb-field"
                    defaultValue={picked.section.h}
                    onBlur={(e) => record({ section: { w: picked.found?.section?.w ?? picked.section.w, h: Number(e.target.value) || picked.section.h } })}
                  />
                  mm
                </span>
              </label>
              <label>
                樹種
                <select
                  className="hb-field"
                  value={picked.found?.species ?? picked.species}
                  onChange={(e) => record({ species: e.target.value as Species })}
                >
                  {(Object.keys(SPECIES_LABEL) as Species[]).map((sp) => (
                    <option key={sp} value={sp}>{SPECIES_LABEL[sp]}</option>
                  ))}
                </select>
              </label>
            </div>
            <label className="frame-memo">
              見たこと
              <textarea
                className="hb-field"
                rows={2}
                defaultValue={picked.found?.memo ?? ''}
                placeholder="端が黒い、触ると柔らかい、など"
                onBlur={(e) => record({ memo: e.target.value })}
              />
            </label>
            {picked.found && (
              <button
                className="hb-btn hb-outline frame-undo"
                onClick={() => { setFound(picked.id, null); setPicked({ ...picked, found: undefined, confidence: 'estimated' }); }}
              >
                この記録を消す
              </button>
            )}
          </div>
        </section>
      )}

      <section className="frame-take">
        <h2 className="frame-h">拾い出し</h2>
        <p className="plan-note">
          {jp(
            `${frame.members.length}本、材積で ${totalM3.toFixed(2)} m³。` +
            '直すときに何を何本買うかは、ここから拾えます。断面は推定なので、確かめた分だけ実物に置き換わります。',
          )}
        </p>
        <div className="frame-table-wrap">
          <table className="frame-table">
            <thead>
              <tr>
                <th>部材</th><th>断面</th><th>本数</th><th>総長さ</th><th>材積</th><th>確かめた</th>
              </tr>
            </thead>
            <tbody>
              {quantities.map((q) => (
                <tr key={q.kind}>
                  <td>{q.label}</td>
                  <td className="num">{q.section.w}×{q.section.h}</td>
                  <td className="num">{q.count}</td>
                  <td className="num">{q.totalM.toFixed(1)} m</td>
                  <td className="num">{q.volumeM3.toFixed(3)} m³</td>
                  <td className="num">{q.checked > 0 ? `${q.checked}/${q.count}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="frame-assume">
        <h2 className="frame-h">置いている前提</h2>
        <label className="frame-toggle">
          <input type="checkbox" checked={minka} onChange={(e) => setMinka(e.target.checked)} />
          古い民家として組む（柱を太く、筋かいの代わりに貫）
        </label>
        <ul className="plain">
          {frame.assumptions.map((a) => <li key={a}>{jp(a)}</li>)}
        </ul>
        {frame.outOfRange.length > 0 && (
          <div className="hb-warn frame-out">
            <b>機械では決められなかったところ</b>
            <ul className="plain">
              {frame.outOfRange.map((a) => <li key={a}>{jp(a)}</li>)}
            </ul>
          </div>
        )}
        <p className="frame-src">
          {jp(
            '梁のせいは 北海道立林産試験場『木造建築のためのスパン表』（すぎ甲種1級・幅105mm・事務室荷重）、' +
            '根太と火打の寸法は 日本住宅・木材技術センター『木造住宅用標準納まり図』から取っています。' +
            'これは構造計算ではありません。壁を抜く・開口を広げるときは、必ず構造の分かる人に見てもらってください。',
          )}
        </p>
      </section>
    </main>
  );
}
