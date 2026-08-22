'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useRef, useState } from 'react';
import {
  deserialize,
  dist,
  estimateModule,
  serialize,
  defaultRoof,
  ROOF_MATERIAL_LABEL,
  ROOF_SHAPE_LABEL,
  setRoomName,
  snapToGrid,
  type Roof,
  type Opening,
} from '@hiraku/core';
import sampleRaw from '@hiraku/core/fixtures/sample-minka.json';
import PlanCanvas from '@/components/PlanCanvas';
import { CONF_COLOR, CONF_LABEL, OPENING_LABEL } from '@/lib/colors';
import { backdropSizeMm, suggestNextMeasurements } from '@hiraku/core';
import BackdropLoader from '@/components/BackdropLoader';
import EditorStart from '@/components/EditorStart';
import NumericDraw, { NumericInspector } from '@/components/NumericDraw';
import { useEditor, type Tool } from '@/lib/store';

const Preview3D = dynamic(() => import('@/components/Preview3D'), { ssr: false });

const TOOLS: { id: Tool; label: string }[] = [
  { id: 'select', label: '選択' },
  { id: 'wall', label: '壁を描く' },
  { id: 'numeric', label: '数値で引く' },
  { id: 'opening', label: '開口' },
  { id: 'pin', label: '劣化ピン' },
  { id: 'delete', label: '削除' },
];

const TRACE_TOOLS: { id: Tool; label: string }[] = [
  { id: 'backdrop', label: '下絵を動かす' },
  { id: 'calibrate', label: '実寸合わせ' },
];

const PIN_CATEGORIES = ['雨漏り', '腐朽', '蟻害', '傾き', '設備', 'その他'] as const;

export default function EditorPage() {
  const model = useEditor((s) => s.model);
  const tool = useEditor((s) => s.tool);
  const openingKind = useEditor((s) => s.openingKind);
  const selected = useEditor((s) => s.selected);
  const history = useEditor((s) => s.history);
  const measurements = useEditor((s) => s.measurements);
  const damagePins = useEditor((s) => s.damagePins);
  const future = useEditor((s) => s.future);
  const { setTool, setOpeningKind, loadModel, mutate, undo, redo, select } = useEditor.getState();
  const [sheetOpen, setSheetOpen] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);
  const fitRef = useRef<(() => void) | null>(null);
  const onFitReady = useCallback((fit: () => void) => {
    fitRef.current = fit;
  }, []);

  const levelIndex = useEditor((s) => s.levelIndex);
  const li = Math.min(levelIndex, model.levels.length - 1);
  const level = model.levels[li]!;
  const nodeById = new Map(level.nodes.map((n) => [n.id, n] as const));

  const selWall = selected?.kind === 'wall' ? level.walls.find((w) => w.id === selected.id) : undefined;
  const selPin = selected?.kind === 'pin' ? damagePins.find((p) => p.id === selected.id) : undefined;
  const suggestions = suggestNextMeasurements(model, measurements);
  const selOpening = selected?.kind === 'opening' ? level.openings.find((o) => o.id === selected.id) : undefined;
  const selNode = selected?.kind === 'node' ? level.nodes.find((n) => n.id === selected.id) : undefined;

  function exportJson() {
    const blob = new Blob([serialize(model)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = model.id + '.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importJson(file: File) {
    try {
      loadModel(deserialize(await file.text()));
    } catch (err) {
      alert('読み込めませんでした: ' + (err instanceof Error ? err.message : String(err)));
    }
  }

  return (
    <div className="fullpane" style={{ background: 'var(--bg)', color: 'var(--fg)' }}>
      <header className="editor-tools">
        <div className="hb-seg floors" role="group" aria-label="階">
          {model.levels.map((lv, i) => (
            <button
              key={lv.id}
              data-on={i === li}
              onClick={() => useEditor.getState().setLevelIndex(i)}
              title={`${lv.name}を編集`}
            >
              {lv.name}
            </button>
          ))}
          <button
            onClick={() => useEditor.getState().addFloor(model.levels[li]!.walls.length > 0)}
            title="階を足す（下の階の外周を写します）"
          >
            ＋階
          </button>
          {li > 0 && (
            <button
              onClick={() => {
                if (confirm(`${level.name}を消します。よろしいですか。`)) {
                  useEditor.getState().removeFloor(li);
                }
              }}
              title="この階を消す"
            >
              −
            </button>
          )}
        </div>
        <div className="hb-seg">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setTool(t.id);
                // 数値入力のときは図面を広く使いたい
                if (t.id === 'numeric') {
                  setSheetOpen(false);
                  window.setTimeout(() => fitRef.current?.(), 60);
                }
              }}
              data-on={tool === t.id}
            >
              {t.label}
            </button>
          ))}
        </div>
        {tool === 'opening' && (
          <select
            value={openingKind}
            onChange={(e) => setOpeningKind(e.target.value as Opening['kind'])}
            className="hb-field"
          >
            {(Object.keys(OPENING_LABEL) as Opening['kind'][]).map((k) => (
              <option key={k} value={k}>{OPENING_LABEL[k]}</option>
            ))}
          </select>
        )}
        {level.backdrop && (
          <div className="hb-seg">
            {TRACE_TOOLS.map((t2) => (
              <button key={t2.id} onClick={() => setTool(t2.id)} data-on={tool === t2.id}>
                {t2.label}
              </button>
            ))}
          </div>
        )}
        {tool === 'calibrate' && (
          <span className="hb-faint" style={{ fontSize: 12 }}>
            {useEditor.getState().calibA
              ? '2点目をクリックしてください'
              : '実寸がわかる2点の、1点目をクリック'}
          </span>
        )}
        {tool === 'pin' && (
          <select
            value={useEditor.getState().pinCategory}
            onChange={(e) => useEditor.getState().setPinCategory(e.target.value as (typeof PIN_CATEGORIES)[number])}
            className="hb-field"
          >
            {PIN_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        )}
        {tool === 'wall' && (
          <span className="hb-faint" style={{ fontSize: 12 }}>クリックで頂点を置き、続けてクリックで壁がつながります(Escで終了)</span>
        )}
        {tool === 'numeric' && (
          <span className="hb-faint" style={{ fontSize: 12 }}>実測した寸法を打ち込みます。図面の点をタップすると起点が移ります</span>
        )}
        <div className="mx-2 h-5 w-px bg-slate-200" />
        <button onClick={undo} disabled={!history.length} className="hb-btn hb-outline">元に戻す</button>
        <button onClick={redo} disabled={!future.length} className="hb-btn hb-outline">やり直す</button>
        <div className="mx-2 h-5 w-px bg-slate-200" />
        <button
          onClick={() => loadModel(deserialize(JSON.stringify(sampleRaw)))}
          className="hb-btn hb-outline"
        >
          サンプルを読み込む
        </button>
        <button onClick={() => fileRef.current?.click()} className="hb-btn hb-outline">JSON読込</button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void importJson(f);
            e.target.value = '';
          }}
        />
        <button onClick={exportJson} className="hb-btn hb-outline">JSON書き出し</button>
        <div className="mx-2 h-5 w-px bg-slate-200" />
        <button
          onClick={() => {
            mutate((m) => {
              const snapped = snapToGrid(m, m.moduleMm, 120);
              m.levels = snapped.levels;
            });
          }}
          className="hb-btn hb-outline"
        >
          グリッド吸着
        </button>
        <button
          onClick={() => useEditor.getState().drawOrthogonalize()}
          className="hb-btn hb-outline"
          title="ほぼ直角の壁を、角をほどかずに直角へそろえます"
        >
          直角にそろえる
        </button>
        <button
          onClick={() => useEditor.getState().drawMergeNodes()}
          className="hb-btn hb-outline"
          title="ほとんど重なっている頂点をひとつにまとめます"
        >
          頂点をまとめる
        </button>
        <button onClick={() => fitRef.current?.()} className="hb-btn hb-outline">全体を表示</button>
        <button
          onClick={() => {
            const m = estimateModule(model);
            mutate((mm) => {
              mm.moduleMm = m;
            });
            alert('壁長の分布から推定したモジュール: ' + m + 'mm');
          }}
          className="hb-btn hb-outline"
        >
          モジュール推定
        </button>
        
        <span className="ml-auto hb-faint desktop-only" style={{ fontSize: 12 }}>
          ホイールで拡大縮小 ／ Option+ドラッグで移動 ／ モジュール {model.moduleMm}mm
        </span>
      </header>

      <div className="editor-shell">
        <div className="editor-canvas">
          <div className="editor-canvas-view">
            <PlanCanvas onFitReady={onFitReady} />
            {level.walls.length === 0 && !level.backdrop && tool !== 'numeric' && <EditorStart />}
          </div>
          {tool === 'numeric' && (
            <NumericDraw onDrew={() => window.setTimeout(() => fitRef.current?.(), 0)} />
          )}
        </div>
        <button
          type="button"
          className="editor-sheet-toggle"
          onClick={() => setSheetOpen((v) => !v)}
          aria-expanded={sheetOpen}
        >
          {sheetOpen ? '▼ 図面を広く使う' : '▲ 道具パネルを開く'}
        </button>
        <aside className="editor-side" data-open={sheetOpen}>
          <div className="editor-3d h-56 shrink-0" style={{ borderBottom: '1px solid var(--border-soft)' }}>
            <Preview3D />
          </div>

          {/* 凡例 */}
          <div className="px-3 py-2" style={{ borderBottom: '1px solid var(--border-soft)' }}>
            <div className="mb-1 text-xs font-semibold hb-muted">確度の凡例</div>
            <div className="flex flex-wrap gap-3 text-xs">
              {(['estimated', 'hypothesis', 'measured'] as const).map((c) => (
                <span key={c} className="inline-flex items-center gap-1">
                  <span className="inline-block h-3 w-3 rounded-sm" style={{ background: CONF_COLOR[c] }} />
                  {CONF_LABEL[c]}
                </span>
              ))}
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-0.5 w-4 border-t-2 border-dashed border-red-600" />
                耐力壁疑い
              </span>
            </div>
          </div>

          {/* 下絵 */}
          <div className="px-3 py-2 text-sm" style={{ borderBottom: '1px solid var(--border-soft)' }}>
            <div className="mb-1 text-xs font-semibold hb-muted">下絵 — なぞって図面にする</div>
            {!level.backdrop && (
              <>
                <p className="hb-faint" style={{ fontSize: 12, lineHeight: 1.75, marginBottom: 8 }}>
                  室内を一周撮った動画、または間取り図の写真を読み込むと、その上をなぞって図面が描けます。
                </p>
                <BackdropLoader />
              </>
            )}
            {level.backdrop && (
              <div className="space-y-2">
                <label className="block text-xs hb-muted">
                  濃さ {Math.round(level.backdrop.opacity * 100)}%
                  <input
                    type="range" min={5} max={100}
                    value={Math.round(level.backdrop.opacity * 100)}
                    onChange={(e) => useEditor.getState().patchBackdrop({ opacity: Number(e.target.value) / 100 })}
                    className="mt-1 w-full"
                  />
                </label>
                <label className="block text-xs hb-muted">
                  回転 {level.backdrop.rotation}°
                  <input
                    type="range" min={-180} max={180}
                    value={level.backdrop.rotation}
                    onChange={(e) => useEditor.getState().patchBackdrop({ rotation: Number(e.target.value) })}
                    className="mt-1 w-full"
                  />
                </label>
                <div className="hb-faint" style={{ fontSize: 11.5, lineHeight: 1.7 }}>
                  図面上の幅 {(backdropSizeMm(level.backdrop).widthMm / 1000).toFixed(2)}m
                  {' / '}1px = {level.backdrop.mmPerPx.toFixed(1)}mm
                </div>
                <p className="hb-warn" style={{ fontSize: 11.5 }}>
                  「実寸合わせ」で、長さのわかる2点（柱の間隔、畳の長辺など）を指定すると縮尺が決まります。
                </p>
                <div className="flex gap-2">
                  <BackdropLoader compact />
                  <button
                    onClick={() => { useEditor.getState().setBackdrop(undefined); setTool('select'); }}
                    className="hb-btn hb-outline"
                  >
                    外す
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 屋根 */}
          <div className="px-3 py-2 text-sm roofpanel" style={{ borderBottom: '1px solid var(--border-soft)' }}>
            <div className="mb-1 text-xs font-semibold hb-muted">屋根 — 外から見た姿と、天井の高さが決まります</div>
            {!model.roof ? (
              <>
                <p className="hb-faint" style={{ fontSize: 12, lineHeight: 1.75, marginBottom: 8 }}>
                  屋根を載せると、外からの見え方が出せます。形は外周の矩形に架けたものとして描きます。
                </p>
                <button className="hb-btn hb-cta" onClick={() => useEditor.getState().setRoof(defaultRoof())}>
                  屋根を載せる
                </button>
              </>
            ) : (
              <div className="roof-fields">
                <label>
                  <span>形</span>
                  <select
                    value={model.roof.shape}
                    onChange={(e) => useEditor.getState().patchRoof({ shape: e.target.value as Roof['shape'] })}
                  >
                    {(Object.keys(ROOF_SHAPE_LABEL) as Roof['shape'][]).map((k) => (
                      <option key={k} value={k}>{ROOF_SHAPE_LABEL[k]}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>屋根材</span>
                  <select
                    value={model.roof.material}
                    onChange={(e) => useEditor.getState().patchRoof({ material: e.target.value as Roof['material'] })}
                  >
                    {(Object.keys(ROOF_MATERIAL_LABEL) as Roof['material'][]).map((k) => (
                      <option key={k} value={k}>{ROOF_MATERIAL_LABEL[k]}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>勾配 {model.roof.pitchSun}寸</span>
                  <input
                    type="range" min={0} max={10} step={0.5} value={model.roof.pitchSun}
                    onChange={(e) => useEditor.getState().patchRoof({ pitchSun: Number(e.target.value) })}
                  />
                </label>
                <label>
                  <span>軒の出 {model.roof.eaveMm}mm</span>
                  <input
                    type="range" min={0} max={1500} step={50} value={model.roof.eaveMm}
                    onChange={(e) => useEditor.getState().patchRoof({ eaveMm: Number(e.target.value) })}
                  />
                </label>
                {(model.roof.shape === 'gable' || model.roof.shape === 'shed') && (
                  <label>
                    <span>棟の向き</span>
                    <select
                      value={model.roof.ridge}
                      onChange={(e) => useEditor.getState().patchRoof({ ridge: e.target.value as 'x' | 'y' })}
                    >
                      <option value="x">左右（東西）</option>
                      <option value="y">上下（南北）</option>
                    </select>
                  </label>
                )}
                <label>
                  <span>外壁</span>
                  <select
                    value={model.exteriorWall ?? 'siding_wood'}
                    onChange={(e) =>
                      mutate((m) => {
                        m.exteriorWall = e.target.value as NonNullable<typeof m.exteriorWall>;
                      })
                    }
                  >
                    <option value="siding_wood">下見板</option>
                    <option value="yakisugi">焼杉</option>
                    <option value="shikkui_out">漆喰</option>
                    <option value="mortar_out">モルタル</option>
                  </select>
                </label>
                <label className="roof-check">
                  <input
                    type="checkbox" checked={model.roof.exposeCeiling}
                    onChange={(e) => useEditor.getState().patchRoof({ exposeCeiling: e.target.checked })}
                  />
                  小屋裏を見せる（化粧屋根裏・勾配天井）
                </label>
                <button className="hb-btn hb-outline" onClick={() => useEditor.getState().setRoof(null)}>
                  屋根を外す
                </button>
              </div>
            )}
          </div>

          {/* 選択中の要素 */}
          <div className="px-3 py-2 text-sm" style={{ borderBottom: '1px solid var(--border-soft)' }}>
            <div className="mb-1 text-xs font-semibold hb-muted">選択中</div>
            {!selected && <div className="text-xs hb-faint">要素をクリックすると詳細が出ます</div>}
            {selWall && (() => {
              const a = nodeById.get(selWall.a);
              const b = nodeById.get(selWall.b);
              const len = a && b ? dist(a, b) : 0;
              return (
                <div className="space-y-2">
                  <div>壁 — 長さ {(len / 1000).toFixed(2)}m / 厚 {selWall.thickness}mm / {CONF_LABEL[selWall.confidence]}</div>
                  <label className="flex items-center gap-2 text-xs">
                    構造
                    <select
                      value={selWall.structural}
                      onChange={(e) =>
                        mutate((m) => {
                          const w = m.levels[li]!.walls.find((x) => x.id === selWall.id);
                          if (w) w.structural = e.target.value as typeof w.structural;
                        })
                      }
                      className="rounded border border-slate-300 px-1 py-0.5"
                    >
                      <option value="unknown">不明</option>
                      <option value="suspected">耐力壁疑い</option>
                      <option value="cleared_by_expert">専門家確認済み</option>
                    </select>
                  </label>
                  <NumericInspector />
                  {selWall.structural === 'suspected' && (
                    <p className="rounded bg-red-50 px-2 py-1 text-xs text-red-700">
                      この壁の撤去・開口の可否は、現地で専門家の確認が必要です。
                    </p>
                  )}
                </div>
              );
            })()}
            {selOpening && (
              <div className="space-y-1 text-xs">
                <div className="text-sm">{OPENING_LABEL[selOpening.kind]}</div>
                {(['offset', 'width', 'height', 'sillHeight'] as const).map((f) => (
                  <label key={f} className="flex items-center justify-between gap-2">
                    {{ offset: '位置(mm)', width: '幅(mm)', height: '高さ(mm)', sillHeight: '床からの高さ(mm)' }[f]}
                    <input
                      type="number"
                      value={selOpening[f]}
                      onChange={(e) =>
                        mutate((m) => {
                          const o = m.levels[li]!.openings.find((x) => x.id === selOpening.id);
                          if (o) o[f] = Number(e.target.value) || 0;
                        })
                      }
                      className="w-24 rounded border border-slate-300 px-1 py-0.5 text-right"
                    />
                  </label>
                ))}
              </div>
            )}
            {selNode && (
              <div className="text-xs">
                <div>
                  頂点 ({(selNode.x / 1000).toFixed(2)}, {(selNode.y / 1000).toFixed(2)})m / {CONF_LABEL[selNode.confidence]}
                </div>
                <NumericInspector />
              </div>
            )}
            {selPin && (
              <div className="space-y-2 text-xs">
                <div className="text-sm font-semibold text-red-700">劣化ピン #{damagePins.indexOf(selPin) + 1}</div>
                <select
                  value={selPin.category}
                  onChange={(e) => useEditor.getState().updatePin(selPin.id, { category: e.target.value as typeof selPin.category })}
                  className="rounded border border-slate-300 px-1 py-0.5"
                >
                  {PIN_CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <textarea
                  value={selPin.memo}
                  onChange={(e) => useEditor.getState().updatePin(selPin.id, { memo: e.target.value })}
                  placeholder="メモ(例: 天井にシミ、押すと沈む)"
                  className="h-16 w-full rounded border border-slate-300 px-2 py-1"
                />
                <button onClick={() => useEditor.getState().removePin(selPin.id)} className="rounded border border-red-300 px-2 py-1 text-red-700 hover:bg-red-50">
                  このピンを削除
                </button>
              </div>
            )}
          </div>

          {/* 実測 */}
          <div className="px-3 py-2 text-sm" style={{ borderBottom: '1px solid var(--border-soft)' }}>
            <div className="mb-1 text-xs font-semibold hb-muted">実測 — 入れるほど図が確かになります</div>
            {selWall && (
              <MeasureInput
                label="選択中の壁の実測長(mm)"
                onSubmit={(v) => useEditor.getState().addMeasurement({ type: 'wallLength', targetIds: [selWall.id], valueMm: v })}
              />
            )}
            {selOpening && (
              <MeasureInput
                label="選択中の開口の実測幅(mm)"
                onSubmit={(v) => useEditor.getState().addMeasurement({ type: 'openingWidth', targetIds: [selOpening.id], valueMm: v })}
              />
            )}
            {selWall && (
              <MeasureInput
                label="選択中の壁の傾き(0.1°単位, 例: 1.5°→15)"
                onSubmit={(v) => useEditor.getState().addMeasurement({ type: 'tilt', targetIds: [selWall.id], valueMm: v, note: '手入力' })}
              />
            )}
            <MeasureInput
              label="天井高(mm)"
              onSubmit={(v) => useEditor.getState().addMeasurement({ type: 'ceilingHeight', targetIds: [], valueMm: v })}
            />
            {!selWall && !selOpening && (
              <p className="mt-1 text-xs hb-faint">壁や開口を選択すると、その実測値を入れられます</p>
            )}

            <div className="mt-2 text-xs font-semibold text-slate-500">次に測ると効く場所</div>
            <ul className="mt-1 space-y-1 text-xs">
              {suggestions.map((s, i) => (
                <li key={i}>
                  <button
                    onClick={() => {
                      if (s.kind === 'wall') select({ kind: 'wall', id: s.targetIds[0]! });
                    }}
                    className="text-left text-blue-700 hover:underline"
                  >
                    {s.label}
                  </button>
                  <span className="ml-1 text-slate-400">— {s.reason}</span>
                </li>
              ))}
            </ul>

            {measurements.length > 0 && (
              <div className="mt-2">
                <div className="text-xs font-semibold text-slate-500">実測一覧({measurements.length})</div>
                <ul className="mt-1 space-y-0.5 text-xs">
                  {measurements.map((m) => (
                    <li key={m.id} className="flex items-center justify-between">
                      <span>
                        {{ wallLength: '壁長', diagonal: '対角', ceilingHeight: '天井高', openingWidth: '開口幅', tilt: '傾き' }[m.type]}: {m.valueMm.toLocaleString()}mm
                      </span>
                      <button onClick={() => useEditor.getState().removeMeasurement(m.id)} className="text-slate-400 hover:text-red-600">×</button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <Link href="/app/survey" className="hb-btn hb-outline mt-2 inline-flex" style={{ fontSize: 12 }}>
              現況調査報告書をつくる
            </Link>
          </div>

          {/* 部屋一覧 */}
          <div className="px-3 py-2">
            <div className="mb-1 text-xs font-semibold hb-muted">
              部屋({level.rooms.length}) — 畳数は面積÷1.62㎡の参考値
            </div>
            <table className="w-full text-sm">
              <tbody>
                {level.rooms.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100">
                    <td className="py-1">
                      <input
                        key={r.id + r.name}
                        defaultValue={r.name}
                        onBlur={(e) => {
                          const name = e.target.value.trim();
                          if (!name || name === r.name) return;
                          const idx = level.rooms.findIndex((x) => x.id === r.id);
                          mutate((m) => {
                            m.levels[li] = setRoomName(m.levels[li]!, idx, name);
                          });
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                        }}
                        className="w-full rounded border border-transparent px-1 py-0.5 hover:border-slate-200 focus:border-slate-300 focus:outline-none"
                      />
                    </td>
                    <td className="py-1 text-right text-slate-600">{r.areaM2.toFixed(2)}㎡</td>
                    <td className="py-1 pl-2 text-right text-slate-500">{r.tatami}畳</td>
                  </tr>
                ))}
                {!level.rooms.length && (
                  <tr><td className="py-2 text-xs hb-faint">壁で囲むと部屋を認識します</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </aside>
      </div>
    </div>
  );
}


function MeasureInput({ label, onSubmit }: { label: string; onSubmit: (v: number) => void }) {
  const [v, setV] = useState('');
  return (
    <div className="mt-1 flex items-end gap-1">
      <label className="flex-1 text-xs text-slate-600">
        {label}
        <input
          value={v}
          onChange={(e) => setV(e.target.value)}
          type="number"
          className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1"
        />
      </label>
      <button
        onClick={() => {
          const n = Number(v);
          if (n > 0) {
            onSubmit(n);
            setV('');
          }
        }}
        className="hb-btn hb-dark" style={{ padding: '7px 12px', fontSize: 12 }}
      >
        登録
      </button>
    </div>
  );
}
