'use client';

import { useMemo, useState } from 'react';
import { dist, vectorHeading } from '@hiraku/core';
import { useEditor } from '@/lib/store';

/**
 * 数値で図面を引くための入力盤。
 *
 * 実測してきた寸法をそのまま打ち込むための道具なので、
 * 画面の下に置いて、片手の親指だけで「向き→長さ→のばす」が回るようにする。
 */

const DIRS: { deg: number; label: string; aria: string }[] = [
  { deg: 270, label: '↑', aria: '上へ' },
  { deg: 0, label: '→', aria: '右へ' },
  { deg: 90, label: '↓', aria: '下へ' },
  { deg: 180, label: '←', aria: '左へ' },
];

/** よく出る寸法。半間・1間・1間半・2間・3間・4間 */
const QUICK = [455, 910, 1365, 1820, 2730, 3640];

export default function NumericDraw({ onDrew }: { onDrew?: () => void }) {
  const model = useEditor((s) => s.model);
  const levelIndex = useEditor((s) => s.levelIndex);
  const li = Math.min(levelIndex, model.levels.length - 1);
  const pendingNodeId = useEditor((s) => s.pendingNodeId);
  const extend = useEditor((s) => s.drawExtend);
  const rect = useEditor((s) => s.drawRect);
  // 引いた先が画面の外に出ないよう、そのつど全体を映し直す
  const drawExtend = (len: number, deg: number) => {
    extend(len, deg);
    onDrew?.();
  };
  const drawRect = (w: number, d: number) => {
    rect(w, d);
    onDrew?.();
  };
  const setPending = useEditor((s) => s.setPending);
  const undo = useEditor((s) => s.undo);

  const [mode, setMode] = useState<'wall' | 'rect'>('wall');
  const [heading, setHeading] = useState(0);
  const [length, setLength] = useState('1820');
  const [rectW, setRectW] = useState('3640');
  const [rectD, setRectD] = useState('2730');
  const [freeAngle, setFreeAngle] = useState(false);

  const level = model.levels[li]!;
  const start = level.nodes.find((n) => n.id === pendingNodeId) ?? level.nodes[level.nodes.length - 1];

  /** 直前に引いた壁の向き。続きを引くときの目安になる */
  const lastHeading = useMemo(() => {
    if (!start) return null;
    const byId = new Map(level.nodes.map((n) => [n.id, n] as const));
    const w = [...level.walls].reverse().find((x) => x.a === start.id || x.b === start.id);
    if (!w) return null;
    const other = byId.get(w.a === start.id ? w.b : w.a);
    if (!other) return null;
    return Math.round(vectorHeading(other, start));
  }, [level, start]);

  const len = Number(length);
  const canExtend = Number.isFinite(len) && len > 0;

  return (
    <div className="numpad">
      <div className="numpad-head">
        <div className="hb-seg numpad-mode">
          <button onClick={() => setMode('wall')} data-on={mode === 'wall'}>1本ずつ</button>
          <button onClick={() => setMode('rect')} data-on={mode === 'rect'}>部屋の形</button>
        </div>
        <span className="numpad-origin">
          {start
            ? `起点 (${(start.x / 1000).toFixed(2)}, ${(start.y / 1000).toFixed(2)})m`
            : '起点は原点から'}
          {lastHeading !== null && <em>／直前の向き {lastHeading}°</em>}
        </span>
        {start && (
          <button className="numpad-clear" onClick={() => setPending(null)}>起点を外す</button>
        )}
      </div>

      {mode === 'wall' ? (
        <>
          <div className="numpad-row">
            <div className="numpad-dirs" role="group" aria-label="向き">
              {DIRS.map((d) => (
                <button
                  key={d.deg}
                  aria-label={d.aria}
                  className={'numpad-dir' + (!freeAngle && heading === d.deg ? ' on' : '')}
                  onClick={() => {
                    setFreeAngle(false);
                    setHeading(d.deg);
                  }}
                >
                  {d.label}
                </button>
              ))}
              <button
                className={'numpad-dir numpad-angle' + (freeAngle ? ' on' : '')}
                onClick={() => setFreeAngle((v) => !v)}
                aria-label="角度を指定"
              >
                角度
              </button>
            </div>
            {freeAngle && (
              <label className="numpad-field numpad-deg">
                <span>角度</span>
                <input
                  type="number"
                  inputMode="numeric"
                  value={heading}
                  onChange={(e) => setHeading(Number(e.target.value) || 0)}
                />
                <b>°</b>
              </label>
            )}
          </div>

          <div className="numpad-row">
            <label className="numpad-field numpad-len">
              <span>長さ</span>
              <input
                type="number"
                inputMode="numeric"
                value={length}
                onChange={(e) => setLength(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && canExtend) drawExtend(len, heading);
                }}
              />
              <b>mm</b>
            </label>
            <button
              className="hb-btn hb-cta numpad-go"
              disabled={!canExtend}
              onClick={() => drawExtend(len, heading)}
            >
              のばす
            </button>
            <button className="hb-btn hb-outline numpad-undo" onClick={undo}>戻す</button>
          </div>

          <div className="chiprow numpad-quick">
            {QUICK.map((q) => (
              <button
                key={q}
                className={'chip' + (String(q) === length ? ' on' : '')}
                onClick={() => setLength(String(q))}
              >
                {q}
              </button>
            ))}
            <span className="numpad-note">910mm＝半間の倍数</span>
          </div>
        </>
      ) : (
        <>
          <div className="numpad-row">
            <label className="numpad-field">
              <span>幅</span>
              <input type="number" inputMode="numeric" value={rectW} onChange={(e) => setRectW(e.target.value)} />
              <b>mm</b>
            </label>
            <label className="numpad-field">
              <span>奥行</span>
              <input type="number" inputMode="numeric" value={rectD} onChange={(e) => setRectD(e.target.value)} />
              <b>mm</b>
            </label>
            <button
              className="hb-btn hb-cta numpad-go"
              disabled={!(Number(rectW) > 0 && Number(rectD) > 0)}
              onClick={() => drawRect(Number(rectW), Number(rectD))}
            >
              置く
            </button>
          </div>
          <div className="chiprow numpad-quick">
            {[
              ['4畳半', 2730, 2730],
              ['6畳', 3640, 2730],
              ['8畳', 3640, 3640],
              ['10畳', 4550, 3640],
              ['土間', 2730, 5460],
            ].map(([label, w, d]) => (
              <button
                key={String(label)}
                className="chip"
                onClick={() => {
                  setRectW(String(w));
                  setRectD(String(d));
                }}
              >
                {label}
              </button>
            ))}
            <span className="numpad-note">起点は左上の角</span>
          </div>
        </>
      )}

      <p className="numpad-hint">
        打ち込んだ寸法は<b>実測</b>として扱います。図面の点をタップすると、そこが起点になります。
        {start && level.walls.length > 0 && (
          <> 一周して最初の点に戻ると、輪が閉じて部屋になります。</>
        )}
      </p>
    </div>
  );
}

/** 選択中の壁・頂点を数値で直すための小さな入力 */
export function NumericInspector() {
  const model = useEditor((s) => s.model);
  const levelIndex = useEditor((s) => s.levelIndex);
  const li = Math.min(levelIndex, model.levels.length - 1);
  const selected = useEditor((s) => s.selected);
  const setWallLen = useEditor((s) => s.drawSetWallLength);
  const alignW = useEditor((s) => s.drawAlignWall);
  const moveN = useEditor((s) => s.drawMoveNode);
  const mutate = useEditor((s) => s.mutate);

  const level = model.levels[li]!;
  const wall = selected?.kind === 'wall' ? level.walls.find((w) => w.id === selected.id) : undefined;
  const node = selected?.kind === 'node' ? level.nodes.find((n) => n.id === selected.id) : undefined;

  const [len, setLen] = useState('');
  const [anchor, setAnchor] = useState<'a' | 'b' | 'center'>('a');
  const [nx, setNx] = useState('');
  const [ny, setNy] = useState('');

  const a = wall ? level.nodes.find((n) => n.id === wall.a) : undefined;
  const b = wall ? level.nodes.find((n) => n.id === wall.b) : undefined;
  const current = a && b ? Math.round(dist(a, b)) : 0;

  if (wall && a && b) {
    return (
      <div className="numins">
        <div className="numins-row">
          <label className="numpad-field">
            <span>長さ</span>
            <input
              type="number"
              inputMode="numeric"
              value={len === '' ? current : len}
              onChange={(e) => setLen(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && Number(len) > 0) {
                  setWallLen(wall.id, Number(len), anchor);
                  setLen('');
                }
              }}
            />
            <b>mm</b>
          </label>
          <button
            className="hb-btn hb-dark"
            disabled={!(Number(len) > 0)}
            onClick={() => {
              setWallLen(wall.id, Number(len), anchor);
              setLen('');
            }}
          >
            この長さにする
          </button>
        </div>
        <div className="numins-row">
          <span className="numins-lab">どちらを固定</span>
          <div className="hb-seg">
            {(
              [
                ['a', '始点'],
                ['center', '真ん中'],
                ['b', '終点'],
              ] as const
            ).map(([v, l]) => (
              <button key={v} data-on={anchor === v} onClick={() => setAnchor(v)}>{l}</button>
            ))}
          </div>
        </div>
        <div className="numins-row">
          <span className="numins-lab">向きをそろえる</span>
          <button className="hb-btn hb-outline" onClick={() => alignW(wall.id, 'h')}>水平</button>
          <button className="hb-btn hb-outline" onClick={() => alignW(wall.id, 'v')}>垂直</button>
        </div>
        <div className="numins-row">
          <label className="numpad-field">
            <span>厚み</span>
            <input
              type="number"
              inputMode="numeric"
              value={wall.thickness}
              onChange={(e) =>
                mutate((m) => {
                  const w = m.levels[0]!.walls.find((x) => x.id === wall.id);
                  if (w) w.thickness = Math.max(30, Number(e.target.value) || 120);
                })
              }
            />
            <b>mm</b>
          </label>
        </div>
      </div>
    );
  }

  if (node) {
    return (
      <div className="numins">
        <div className="numins-row">
          <label className="numpad-field">
            <span>X</span>
            <input type="number" inputMode="numeric" value={nx === '' ? node.x : nx} onChange={(e) => setNx(e.target.value)} />
            <b>mm</b>
          </label>
          <label className="numpad-field">
            <span>Y</span>
            <input type="number" inputMode="numeric" value={ny === '' ? node.y : ny} onChange={(e) => setNy(e.target.value)} />
            <b>mm</b>
          </label>
          <button
            className="hb-btn hb-dark"
            onClick={() => {
              moveN(node.id, nx === '' ? node.x : Number(nx), ny === '' ? node.y : Number(ny));
              setNx('');
              setNy('');
            }}
          >
            移す
          </button>
        </div>
      </div>
    );
  }
  return null;
}
