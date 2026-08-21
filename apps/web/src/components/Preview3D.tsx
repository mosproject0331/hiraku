'use client';

import { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { dist } from '@hiraku/core';
import { CONF_COLOR, OPENING_COLOR } from '@/lib/colors';
import { useEditor } from '@/lib/store';

interface Orbit {
  theta: number;
  phi: number;
  r: number;
}

function CameraRig({ orbit, cx, cz }: { orbit: React.RefObject<Orbit>; cx: number; cz: number }) {
  useFrame(({ camera }) => {
    const o = orbit.current;
    camera.position.set(
      cx + o.r * Math.sin(o.phi) * Math.cos(o.theta),
      o.r * Math.cos(o.phi),
      cz + o.r * Math.sin(o.phi) * Math.sin(o.theta),
    );
    camera.lookAt(cx, 1, cz);
  });
  return null;
}

export default function Preview3D() {
  const model = useEditor((s) => s.model);
  const level = model.levels[0]!;
  const nodeById = new Map(level.nodes.map((n) => [n.id, n] as const));

  const xs = level.nodes.map((n) => n.x);
  const ys = level.nodes.map((n) => n.y);
  const cx = xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 / 1000 : 0;
  const cz = ys.length ? (Math.min(...ys) + Math.max(...ys)) / 2 / 1000 : 0;
  const spanX = xs.length ? (Math.max(...xs) - Math.min(...xs)) / 1000 : 10;
  const spanZ = ys.length ? (Math.max(...ys) - Math.min(...ys)) / 1000 : 7;
  const h = level.heightMm / 1000;

  const orbit = useRef<Orbit>({ theta: Math.PI / 4, phi: Math.PI / 3.2, r: Math.max(spanX, spanZ) * 1.7 + 4 });
  const drag = useRef<{ x: number; y: number } | null>(null);

  return (
    <div
      className="h-full w-full touch-none cursor-grab active:cursor-grabbing"
      onPointerDown={(e) => {
        drag.current = { x: e.clientX, y: e.clientY };
        (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        const dx = e.clientX - drag.current.x;
        const dy = e.clientY - drag.current.y;
        drag.current = { x: e.clientX, y: e.clientY };
        orbit.current.theta += dx * 0.008;
        orbit.current.phi = Math.min(Math.max(orbit.current.phi - dy * 0.006, 0.15), 1.5);
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
      onWheel={(e) => {
        orbit.current.r = Math.min(Math.max(orbit.current.r + e.deltaY * 0.02, 3), 80);
      }}
    >
      <Canvas camera={{ fov: 50, position: [10, 10, 10] }}>
        <color attach="background" args={['#f1f5f9']} />
        <ambientLight intensity={0.85} />
        <directionalLight position={[12, 18, 8]} intensity={1.1} />
        <CameraRig orbit={orbit} cx={cx} cz={cz} />

        {/* 床 */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, -0.01, cz]}>
          <planeGeometry args={[spanX + 3, spanZ + 3]} />
          <meshStandardMaterial color="#e2e8f0" />
        </mesh>

        {/* 壁: 確度3色で押し出し */}
        {level.walls.map((w) => {
          const a = nodeById.get(w.a);
          const b = nodeById.get(w.b);
          if (!a || !b) return null;
          const len = dist(a, b) / 1000;
          if (len === 0) return null;
          const angle = Math.atan2(b.y - a.y, b.x - a.x);
          return (
            <mesh
              key={w.id}
              position={[(a.x + b.x) / 2 / 1000, h / 2, (a.y + b.y) / 2 / 1000]}
              rotation={[0, -angle, 0]}
            >
              <boxGeometry args={[len, h, w.thickness / 1000]} />
              <meshStandardMaterial color={CONF_COLOR[w.confidence]} />
            </mesh>
          );
        })}

        {/* 開口: 矩形の色分け表示(くり抜き省略) */}
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
          const mx = a.x + ux * (o.offset + o.width / 2);
          const my = a.y + uy * (o.offset + o.width / 2);
          const angle = Math.atan2(b.y - a.y, b.x - a.x);
          const oh = o.height / 1000;
          const sill = o.sillHeight / 1000;
          return (
            <mesh
              key={o.id}
              position={[mx / 1000, sill + oh / 2, my / 1000]}
              rotation={[0, -angle, 0]}
            >
              <boxGeometry args={[o.width / 1000, oh, (w.thickness + 60) / 1000]} />
              <meshStandardMaterial color={OPENING_COLOR[o.kind]} />
            </mesh>
          );
        })}
      </Canvas>
    </div>
  );
}
