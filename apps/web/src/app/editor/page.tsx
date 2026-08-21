'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRef, useState } from 'react';
import {
  deserialize,
  dist,
  estimateModule,
  serialize,
  setRoomName,
  snapToGrid,
  type Opening,
} from '@hiraku/core';
import sampleRaw from '@hiraku/core/fixtures/sample-minka.json';
import PlanCanvas from '@/components/PlanCanvas';
import { CONF_COLOR, CONF_LABEL, OPENING_LABEL } from '@/lib/colors';
import { suggestNextMeasurements } from '@hiraku/core';
import { useEditor, type Tool } from '@/lib/store';

const Preview3D = dynamic(() => import('@/components/Preview3D'), { ssr: false });

const TOOLS: { id: Tool; label: string }[] = [
  { id: 'select', label: '選択' },
  { id: 'wall', label: '壁を描く' },
  { id: 'opening', label: '開口' },
  { id: 'pin', label: '劣化ピン' },
  { id: 'delete', label: '削除' },
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
  const fileRef = useRef<HTMLInputElement>(null);

  const level = model.levels[0]!;
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
    <div className="flex h-screen flex-col bg-slate-100 text-slate-900">
      <header className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-3 py-2">
        <Link href="/" className="mr-2 text-sm font-semibold text-slate-500 hover:text-slate-800">HIRAKU</Link>
        <div className="flex overflow-hidden rounded-md border border-slate-300">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTool(t.id)}
              className={
                'px-3 py-1.5 text-sm ' +
                (tool === t.id ? 'bg-slate-800 text-white' : 'bg-white hover:bg-slate-50')
              }
            >
              {t.label}
            </button>
          ))}
        </div>
        {tool === 'opening' && (
          <select
            value={openingKind}
            onChange={(e) => setOpeningKind(e.target.value as Opening['kind'])}
            className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
          >
            {(Object.keys(OPENING_LABEL) as Opening['kind'][]).map((k) => (
              <option key={k} value={k}>{OPENING_LABEL[k]}</option>
            ))}
          </select>
        )}
        {tool === 'pin' && (
          <select
            value={useEditor.getState().pinCategory}
            onChange={(e) => useEditor.getState().setPinCategory(e.target.value as (typeof PIN_CATEGORIES)[number])}
            className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
          >
            {PIN_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        )}
        {tool === 'wall' && (
          <span className="text-xs text-slate-500">クリックで頂点を置き、続けてクリックで壁がつながります(Escで終了)</span>
        )}
        <div className="mx-2 h-5 w-px bg-slate-200" />
        <button onClick={undo} disabled={!history.length} className="rounded border border-slate-300 bg-white px-2.5 py-1.5 text-sm disabled:opacity-40">元に戻す</button>
        <button onClick={redo} disabled={!future.length} className="rounded border border-slate-300 bg-white px-2.5 py-1.5 text-sm disabled:opacity-40">やり直す</button>
        <div className="mx-2 h-5 w-px bg-slate-200" />
        <button
          onClick={() => loadModel(deserialize(JSON.stringify(sampleRaw)))}
          className="rounded border border-slate-300 bg-white px-2.5 py-1.5 text-sm hover:bg-slate-50"
        >
          サンプルを読み込む
        </button>
        <button onClick={() => fileRef.current?.click()} className="rounded border border-slate-300 bg-white px-2.5 py-1.5 text-sm hover:bg-slate-50">JSON読込</button>
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
        <button onClick={exportJson} className="rounded border border-slate-300 bg-white px-2.5 py-1.5 text-sm hover:bg-slate-50">JSON書き出し</button>
        <div className="mx-2 h-5 w-px bg-slate-200" />
        <button
          onClick={() => {
            const snapped = snapToGrid(model, model.moduleMm, 120);
            loadModel(snapped);
          }}
          className="rounded border border-slate-300 bg-white px-2.5 py-1.5 text-sm hover:bg-slate-50"
        >
          グリッド吸着
        </button>
        <button
          onClick={() => {
            const m = estimateModule(model);
            mutate((mm) => {
              mm.moduleMm = m;
            });
            alert('壁長の分布から推定したモジュール: ' + m + 'mm');
          }}
          className="rounded border border-slate-300 bg-white px-2.5 py-1.5 text-sm hover:bg-slate-50"
        >
          モジュール推定
        </button>
        <Link href="/plan" className="rounded bg-emerald-700 px-2.5 py-1.5 text-sm text-white hover:bg-emerald-600">改修の相談へ</Link>
        <span className="ml-auto text-xs text-slate-500">モジュール {model.moduleMm}mm</span>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[1fr_360px]">
        <div className="min-h-0">
          <PlanCanvas />
        </div>
        <aside className="flex min-h-0 flex-col overflow-y-auto border-l border-slate-200 bg-white">
          <div className="h-56 shrink-0 border-b border-slate-200">
            <Preview3D />
          </div>

          {/* 凡例 */}
          <div className="border-b border-slate-200 px-3 py-2">
            <div className="mb-1 text-xs font-semibold text-slate-500">確度の凡例</div>
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

          {/* 選択中の要素 */}
          <div className="border-b border-slate-200 px-3 py-2 text-sm">
            <div className="mb-1 text-xs font-semibold text-slate-500">選択中</div>
            {!selected && <div className="text-xs text-slate-400">要素をクリックすると詳細が出ます</div>}
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
                          const w = m.levels[0]!.walls.find((x) => x.id === selWall.id);
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
                          const o = m.levels[0]!.openings.find((x) => x.id === selOpening.id);
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
                頂点 ({(selNode.x / 1000).toFixed(2)}, {(selNode.y / 1000).toFixed(2)})m / {CONF_LABEL[selNode.confidence]}
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
          <div className="border-b border-slate-200 px-3 py-2 text-sm">
            <div className="mb-1 text-xs font-semibold text-slate-500">実測 — 入れるほど図が確かになります</div>
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
              <p className="mt-1 text-xs text-slate-400">壁や開口を選択すると、その実測値を入れられます</p>
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
            <Link href="/survey" className="mt-2 inline-block rounded border border-slate-300 px-2.5 py-1.5 text-xs hover:bg-slate-50">
              現況調査報告書をつくる
            </Link>
          </div>

          {/* 部屋一覧 */}
          <div className="px-3 py-2">
            <div className="mb-1 text-xs font-semibold text-slate-500">
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
                            m.levels[0] = setRoomName(m.levels[0]!, idx, name);
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
                  <tr><td className="py-2 text-xs text-slate-400">壁で囲むと部屋を認識します</td></tr>
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
        className="rounded bg-slate-800 px-2 py-1 text-xs text-white"
      >
        登録
      </button>
    </div>
  );
}
