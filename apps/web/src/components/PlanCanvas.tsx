'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  detectFaces,
  dist,
  polygonCentroid,
  type Level,
  type Node as PNode,
  type Opening,
  type Wall,
  type XY,
} from '@hiraku/core';
import { CONF_COLOR, OPENING_COLOR } from '@/lib/colors';
import { freshId, useEditor } from '@/lib/store';

const NODE_R = 70;
const SNAP_EXISTING = 200;

export default function PlanCanvas() {
  const model = useEditor((s) => s.model);
  const tool = useEditor((s) => s.tool);
  const openingKind = useEditor((s) => s.openingKind);
  const selected = useEditor((s) => s.selected);
  const pendingNodeId = useEditor((s) => s.pendingNodeId);
  const { mutate, checkpoint, select, setPending, undo, redo } = useEditor.getState();

  const svgRef = useRef<SVGSVGElement>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const dragMoved = useRef(false);

  const level: Level = model.levels[0]!;
  const nodeById = new Map(level.nodes.map((n) => [n.id, n] as const));

  // 表示範囲
  const xs = level.nodes.map((n) => n.x);
  const ys = level.nodes.map((n) => n.y);
  const minX = xs.length ? Math.min(...xs) : 0;
  const maxX = xs.length ? Math.max(...xs) : 10920;
  const minY = ys.length ? Math.min(...ys) : 0;
  const maxY = ys.length ? Math.max(...ys) : 7280;
  const M = 1600;
  const vb = `${minX - M} ${minY - M} ${maxX - minX + 2 * M} ${maxY - minY + 2 * M}`;

  const svgPoint = useCallback((e: { clientX: number; clientY: number }): XY | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }, []);

  // キーボード: Esc / Delete / undo / redo
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      if (e.key === 'Escape') setPending(null);
      if ((e.key === 'Delete' || e.key === 'Backspace') && useEditor.getState().selected) {
        e.preventDefault();
        removeSelected();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function removeSelected() {
    const sel = useEditor.getState().selected;
    if (!sel) return;
    mutate((m) => {
      const lv = m.levels[0]!;
      if (sel.kind === 'wall') {
        lv.walls = lv.walls.filter((w) => w.id !== sel.id);
        lv.openings = lv.openings.filter((o) => o.wallId !== sel.id);
      } else if (sel.kind === 'node') {
        const gone = new Set(lv.walls.filter((w) => w.a === sel.id || w.b === sel.id).map((w) => w.id));
        lv.walls = lv.walls.filter((w) => !gone.has(w.id));
        lv.openings = lv.openings.filter((o) => !gone.has(o.wallId));
        lv.nodes = lv.nodes.filter((n) => n.id !== sel.id);
      } else {
        lv.openings = lv.openings.filter((o) => o.id !== sel.id);
      }
    });
    select(null);
  }

  /** 半モジュール格子へスナップした座標 */
  function snapPoint(p: XY): XY {
    const g = Math.max(5, Math.round(model.moduleMm / 2));
    return { x: Math.round(p.x / g) * g, y: Math.round(p.y / g) * g };
  }

  function findNodeNear(p: XY): PNode | undefined {
    let best: PNode | undefined;
    let bestD = SNAP_EXISTING;
    for (const n of level.nodes) {
      const d = dist(n, p);
      if (d < bestD) {
        bestD = d;
        best = n;
      }
    }
    return best;
  }

  function onBackgroundClick(e: React.MouseEvent) {
    const p = svgPoint(e);
    if (!p) return;
    if (tool === 'wall') {
      const near = findNodeNear(p);
      const sp = near ?? snapPoint(p);
      let targetId: string;
      mutate((m) => {
        const lv = m.levels[0]!;
        if (near) {
          targetId = near.id;
        } else {
          targetId = freshId('n');
          lv.nodes.push({ id: targetId, x: sp.x, y: sp.y, confidence: 'measured' });
        }
        const pending = useEditor.getState().pendingNodeId;
        if (pending && pending !== targetId) {
          const exists = lv.walls.some(
            (w) => (w.a === pending && w.b === targetId) || (w.b === pending && w.a === targetId),
          );
          if (!exists) {
            lv.walls.push({
              id: freshId('w'),
              a: pending,
              b: targetId,
              thickness: 120,
              confidence: 'measured',
              structural: 'unknown',
            });
          }
        }
      });
      setPending(near && pendingNodeId === near.id ? null : targetId!);
      return;
    }
    select(null);
  }

  function onWallClick(e: React.MouseEvent, wall: Wall) {
    e.stopPropagation();
    if (tool === 'delete') {
      select({ kind: 'wall', id: wall.id });
      mutate((m) => {
        const lv = m.levels[0]!;
        lv.walls = lv.walls.filter((w) => w.id !== wall.id);
        lv.openings = lv.openings.filter((o) => o.wallId !== wall.id);
      });
      select(null);
      return;
    }
    if (tool === 'opening') {
      const p = svgPoint(e);
      const a = nodeById.get(wall.a);
      const b = nodeById.get(wall.b);
      if (!p || !a || !b) return;
      const len = dist(a, b);
      const t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / (len * len);
      const width = openingKind === 'window' ? 1650 : openingKind === 'entrance' ? 1200 : 780;
      if (len < width + 100) return;
      const offset = Math.min(Math.max(t * len - width / 2, 50), len - width - 50);
      const id = freshId('o');
      mutate((m) => {
        m.levels[0]!.openings.push({
          id,
          wallId: wall.id,
          offset: Math.round(offset),
          width,
          height: openingKind === 'window' ? 1100 : 2000,
          sillHeight: openingKind === 'window' ? 800 : 0,
          kind: openingKind,
          confidence: 'measured',
        });
      });
      select({ kind: 'opening', id });
      return;
    }
    select({ kind: 'wall', id: wall.id });
  }

  function onNodePointerDown(e: React.PointerEvent, node: PNode) {
    e.stopPropagation();
    if (tool === 'delete') {
      select({ kind: 'node', id: node.id });
      removeSelected();
      return;
    }
    if (tool === 'wall') {
      // 既存ノードから描き始める
      setPending(pendingNodeId === node.id ? null : node.id);
      if (pendingNodeId && pendingNodeId !== node.id) {
        mutate((m) => {
          const lv = m.levels[0]!;
          const exists = lv.walls.some(
            (w) => (w.a === pendingNodeId && w.b === node.id) || (w.b === pendingNodeId && w.a === node.id),
          );
          if (!exists) {
            lv.walls.push({
              id: freshId('w'),
              a: pendingNodeId,
              b: node.id,
              thickness: 120,
              confidence: 'measured',
              structural: 'unknown',
            });
          }
        });
        setPending(node.id);
      }
      return;
    }
    select({ kind: 'node', id: node.id });
    if (tool === 'select') {
      checkpoint();
      dragMoved.current = false;
      setDragId(node.id);
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragId) return;
    const p = svgPoint(e);
    if (!p) return;
    dragMoved.current = true;
    mutate(
      (m) => {
        const n = m.levels[0]!.nodes.find((x) => x.id === dragId);
        if (n) {
          n.x = Math.round(p.x / 5) * 5;
          n.y = Math.round(p.y / 5) * 5;
        }
      },
      { skipHistory: true },
    );
  }

  function onPointerUp() {
    if (!dragId) return;
    if (dragMoved.current) {
      // 人の修正は measured として尊重(§2-7)
      mutate(
        (m) => {
          const n = m.levels[0]!.nodes.find((x) => x.id === dragId);
          if (n) n.confidence = 'measured';
        },
        { skipHistory: true },
      );
    }
    setDragId(null);
  }

  // グリッド線
  const gridLines: React.ReactNode[] = [];
  const g = model.moduleMm;
  for (let x = Math.floor((minX - M) / g) * g; x <= maxX + M; x += g) {
    gridLines.push(
      <line key={'gx' + x} x1={x} y1={minY - M} x2={x} y2={maxY + M} stroke="#e2e8f0" strokeWidth={12} />,
    );
  }
  for (let y = Math.floor((minY - M) / g) * g; y <= maxY + M; y += g) {
    gridLines.push(
      <line key={'gy' + y} x1={minX - M} y1={y} x2={maxX + M} y2={y} stroke="#e2e8f0" strokeWidth={12} />,
    );
  }

  const faces = detectFaces(level);

  return (
    <svg
      ref={svgRef}
      viewBox={vb}
      className="h-full w-full touch-none select-none bg-white"
      onClick={onBackgroundClick}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {gridLines}

      {/* 部屋: 面ポリゴンとラベル */}
      {faces.map((f, i) => {
        const pts = f.nodeIds.map((id) => nodeById.get(id)!).filter(Boolean);
        const room = level.rooms[i];
        const c = polygonCentroid(pts);
        return (
          <g key={'face' + i}>
            <polygon
              points={pts.map((p) => p.x + ',' + p.y).join(' ')}
              fill="#f8fafc"
              stroke="none"
            />
            {room && (
              <text x={c.x} y={c.y} textAnchor="middle" fontSize={340} fill="#334155">
                <tspan x={c.x} dy={-100} fontWeight={600}>
                  {room.name}
                </tspan>
                <tspan x={c.x} dy={420} fontSize={280} fill="#64748b">
                  {room.areaM2.toFixed(2)}㎡ / {room.tatami}畳
                </tspan>
              </text>
            )}
          </g>
        );
      })}

      {/* 壁 */}
      {level.walls.map((w) => {
        const a = nodeById.get(w.a);
        const b = nodeById.get(w.b);
        if (!a || !b) return null;
        const isSel = selected?.kind === 'wall' && selected.id === w.id;
        const len = dist(a, b);
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        const nx = len > 0 ? -(b.y - a.y) / len : 0;
        const ny = len > 0 ? (b.x - a.x) / len : 0;
        return (
          <g key={w.id}>
            {isSel && (
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#bfdbfe" strokeWidth={w.thickness + 220} strokeLinecap="round" />
            )}
            <line
              x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              stroke={CONF_COLOR[w.confidence]}
              strokeWidth={w.thickness}
              strokeLinecap="butt"
            />
            {w.structural === 'suspected' && (
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#dc2626" strokeWidth={34} strokeDasharray="240 160" />
            )}
            {/* 当たり判定 */}
            <line
              x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              stroke="transparent" strokeWidth={340}
              className="cursor-pointer"
              onClick={(e) => onWallClick(e, w)}
            />
            {len >= 600 && (
              <text
                x={mx + nx * 330} y={my + ny * 330}
                textAnchor="middle" dominantBaseline="middle"
                fontSize={230} fill="#94a3b8"
              >
                {(len / 1000).toFixed(2)}m
              </text>
            )}
          </g>
        );
      })}

      {/* 開口 */}
      {level.openings.map((o) => {
        const w = level.walls.find((x) => x.id === o.wallId);
        if (!w) return null;
        const a = nodeById.get(w.a);
        const b = nodeById.get(w.b);
        if (!a || !b) return null;
        const len = dist(a, b);
        if (len === 0) return null;
        const ux = (b.x - a.x) / len;
        const uy = (b.y - a.y) / len;
        const p1 = { x: a.x + ux * o.offset, y: a.y + uy * o.offset };
        const p2 = { x: p1.x + ux * o.width, y: p1.y + uy * o.width };
        const isSel = selected?.kind === 'opening' && selected.id === o.id;
        return (
          <g key={o.id} className="cursor-pointer" onClick={(e) => {
            e.stopPropagation();
            if (tool === 'delete') {
              mutate((m) => {
                m.levels[0]!.openings = m.levels[0]!.openings.filter((x) => x.id !== o.id);
              });
              select(null);
            } else {
              select({ kind: 'opening', id: o.id });
            }
          }}>
            {isSel && (
              <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#bfdbfe" strokeWidth={w.thickness + 260} strokeLinecap="round" />
            )}
            <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#ffffff" strokeWidth={w.thickness + 10} />
            <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={OPENING_COLOR[o.kind]} strokeWidth={70} />
          </g>
        );
      })}

      {/* ノード */}
      {level.nodes.map((n) => {
        const isSel = selected?.kind === 'node' && selected.id === n.id;
        const isPending = pendingNodeId === n.id;
        return (
          <g key={n.id}>
            {(isSel || isPending) && (
              <circle cx={n.x} cy={n.y} r={NODE_R + 90} fill="none" stroke={isPending ? '#f59e0b' : '#2563eb'} strokeWidth={40} />
            )}
            <circle
              cx={n.x} cy={n.y} r={NODE_R}
              fill={CONF_COLOR[n.confidence]}
              stroke="#ffffff" strokeWidth={26}
              className={tool === 'select' ? 'cursor-move' : 'cursor-pointer'}
              onPointerDown={(e) => onNodePointerDown(e, n)}
              onClick={(e) => e.stopPropagation()}
            />
          </g>
        );
      })}
    </svg>
  );
}
