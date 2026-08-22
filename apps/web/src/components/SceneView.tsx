'use client';

import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { dist, type CameraSpec, type RenovationScene, type WaterUnit } from '@hiraku/core';

export interface SceneViewHandle {
  /** 現在の見え方をPNGのデータURLで取り出す（写実化の条件画像に使う） */
  capture: () => string | null;
}

const WATER_SIZE: Record<WaterUnit, [number, number, number]> = {
  kitchen: [2.4, 0.9, 0.65],
  toilet: [0.75, 0.75, 0.45],
  bath: [1.6, 1.0, 1.6],
  sink: [0.75, 0.85, 0.5],
};
const WATER_COLOR: Record<WaterUnit, string> = {
  kitchen: '#3d4550',
  toilet: '#e8e8ea',
  bath: '#dfe4e6',
  sink: '#e8e8ea',
};

function Rig({ cam }: { cam: CameraSpec }) {
  const { camera } = useThree();
  useFrame(() => {
    const c = camera as THREE.PerspectiveCamera;
    if (c.fov !== cam.fovDeg) {
      c.fov = cam.fovDeg;
      c.updateProjectionMatrix();
    }
    c.position.set(cam.position[0], cam.position[1], cam.position[2]);
    c.lookAt(cam.target[0], cam.target[1], cam.target[2]);
  });
  return null;
}

function Capturer({ handle }: { handle: React.MutableRefObject<SceneViewHandle | null> }) {
  const { gl, scene, camera } = useThree();
  handle.current = {
    capture: () => {
      try {
        gl.render(scene, camera);
        return gl.domElement.toDataURL('image/png');
      } catch {
        return null;
      }
    },
  };
  return null;
}

/** 部屋の外周(mm)から床のポリゴン形状をつくる */
function floorShape(outline: { x: number; y: number }[]): THREE.Shape {
  const s = new THREE.Shape();
  outline.forEach((p, i) => {
    const x = p.x / 1000;
    const y = p.y / 1000;
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  });
  s.closePath();
  return s;
}

/** 改修案の3Dシーン。開口は壁を分割して本当に抜く */
const SceneView = forwardRef<SceneViewHandle, { scene: RenovationScene; camera: CameraSpec }>(
  function SceneView({ scene, camera }, ref) {
    const handle = useRef<SceneViewHandle | null>(null);
    useImperativeHandle(ref, () => ({ capture: () => handle.current?.capture() ?? null }), []);

    const level = scene.model.levels[0];
    const h = (level?.heightMm ?? 2400) / 1000;
    const nodeById = useMemo(
      () => new Map((level?.nodes ?? []).map((n) => [n.id, n] as const)),
      [level],
    );

    if (!level) return null;

    return (
      <Canvas
        gl={{ preserveDrawingBuffer: true, antialias: true }}
        camera={{ fov: camera.fovDeg, near: 0.05, far: 200 }}
        shadows
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 0.95;
        }}
      >
        <color attach="background" args={['#e9e4da']} />
        <fog attach="fog" args={['#e9e4da', 18, 42]} />
        <Rig cam={camera} />
        <Capturer handle={handle} />

        {/* 光: 窓からの自然光を想定した斜めの主光 + 環境光 */}
        <ambientLight intensity={0.22} />
        <hemisphereLight args={['#fdf3e4', '#5a4f45', 0.35]} />
        <directionalLight
          position={[6, 7, 4]}
          intensity={0.9}
          castShadow
          shadow-mapSize={[1024, 1024]}
        />

        {/* 床（部屋ごとの仕上げ） */}
        {scene.rooms.map((r) =>
          r.outline.length >= 3 ? (
            <mesh key={'f' + r.roomId} rotation={[Math.PI / 2, 0, 0]} position={[0, 0.001, 0]} receiveShadow>
              <shapeGeometry args={[floorShape(r.outline)]} />
              <meshStandardMaterial color={r.floor.color} roughness={r.floor.roughness} side={THREE.DoubleSide} />
            </mesh>
          ) : null,
        )}

        {/* 天井 */}
        {scene.rooms.map((r) =>
          r.outline.length >= 3 ? (
            <mesh key={'c' + r.roomId} rotation={[Math.PI / 2, 0, 0]} position={[0, h, 0]}>
              <shapeGeometry args={[floorShape(r.outline)]} />
              <meshStandardMaterial color={r.ceiling.color} roughness={r.ceiling.roughness} side={THREE.DoubleSide} />
            </mesh>
          ) : null,
        )}

        {/* 壁: 開口の位置で上下・左右に割って、実際に穴を空ける */}
        {level.walls.map((w) => {
          const a = nodeById.get(w.a);
          const b = nodeById.get(w.b);
          if (!a || !b) return null;
          const len = dist(a, b) / 1000;
          if (len < 0.01) return null;
          const angle = Math.atan2(b.y - a.y, b.x - a.x);
          const th = w.thickness / 1000;
          const mx = (a.x + b.x) / 2000;
          const mz = (a.y + b.y) / 2000;
          const wallColor = scene.rooms[0]?.wall.color ?? '#e8e4dc';
          const wallRough = scene.rooms[0]?.wall.roughness ?? 0.9;

          const openings = level.openings
            .filter((o) => o.wallId === w.id)
            .map((o) => ({
              from: o.offset / 1000,
              to: (o.offset + o.width) / 1000,
              sill: o.sillHeight / 1000,
              top: (o.sillHeight + o.height) / 1000,
              kind: o.kind,
            }))
            .sort((p, q) => p.from - q.from);

          // 壁面を、開口で分けた区画に切る
          const pieces: { off: number; w: number; y: number; h: number }[] = [];
          let cursor = 0;
          for (const o of openings) {
            if (o.from > cursor) pieces.push({ off: cursor, w: o.from - cursor, y: 0, h });
            if (o.sill > 0) pieces.push({ off: o.from, w: o.to - o.from, y: 0, h: o.sill });
            if (o.top < h) pieces.push({ off: o.from, w: o.to - o.from, y: o.top, h: h - o.top });
            cursor = Math.max(cursor, o.to);
          }
          if (cursor < len) pieces.push({ off: cursor, w: len - cursor, y: 0, h });

          return (
            <group key={w.id} position={[mx, 0, mz]} rotation={[0, -angle, 0]}>
              {pieces.map((p, i) =>
                p.w > 0.005 && p.h > 0.005 ? (
                  <mesh
                    key={i}
                    position={[p.off + p.w / 2 - len / 2, p.y + p.h / 2, 0]}
                    castShadow
                    receiveShadow
                  >
                    <boxGeometry args={[p.w, p.h, th]} />
                    <meshStandardMaterial color={wallColor} roughness={wallRough} />
                  </mesh>
                ) : null,
              )}
              {/* 建具の枠（窓・戸の存在を形として残す） */}
              {openings
                .filter((o) => o.kind === 'window' || o.kind === 'entrance')
                .map((o, i) => (
                  <pointLight
                    key={'wl' + i}
                    position={[o.from + (o.to - o.from) / 2 - len / 2, (o.sill + o.top) / 2, th * 0.9]}
                    intensity={(o.to - o.from) * 5.5}
                    distance={9}
                    decay={2}
                    color="#fff2dd"
                  />
                ))}
              {openings.map((o, i) => (
                <mesh
                  key={'fr' + i}
                  position={[o.from + (o.to - o.from) / 2 - len / 2, o.sill + (o.top - o.sill) / 2, 0]}
                >
                  <boxGeometry args={[o.to - o.from, o.top - o.sill, th * 0.35]} />
                  <meshStandardMaterial
                    color={o.kind === 'window' ? '#eef6fb' : '#7d6650'}
                    roughness={o.kind === 'window' ? 0.1 : 0.65}
                    emissive={o.kind === 'window' ? '#dfeeff' : '#000000'}
                    emissiveIntensity={o.kind === 'window' ? 1.6 : 0}
                    transparent={o.kind === 'window'}
                    opacity={o.kind === 'window' ? 0.55 : 1}
                  />
                </mesh>
              ))}
            </group>
          );
        })}

        {/* 水回りの設備（大きさの当たりとして置く） */}
        {scene.rooms.flatMap((r) =>
          r.waterUnits.map((u, i) => {
            if (r.outline.length < 3) return null;
            const cx = r.outline.reduce((s, p) => s + p.x, 0) / r.outline.length / 1000;
            const cz = r.outline.reduce((s, p) => s + p.y, 0) / r.outline.length / 1000;
            const [sx, sy, sz] = WATER_SIZE[u];
            return (
              <mesh key={r.roomId + u + i} position={[cx + i * 0.9, sy / 2, cz]} castShadow>
                <boxGeometry args={[sx, sy, sz]} />
                <meshStandardMaterial color={WATER_COLOR[u]} roughness={0.4} />
              </mesh>
            );
          }),
        )}

        {/* 照明器具 */}
        {scene.rooms.flatMap((r) =>
          Array.from({ length: Math.min(r.lights, 3) }, (_, i) => {
            if (r.outline.length < 3) return null;
            const cx = r.outline.reduce((s, p) => s + p.x, 0) / r.outline.length / 1000;
            const cz = r.outline.reduce((s, p) => s + p.y, 0) / r.outline.length / 1000;
            const x = cx + (i - 1) * 1.2;
            return (
              <group key={r.roomId + 'l' + i} position={[x, h - 0.35, cz]}>
                <mesh>
                  <cylinderGeometry args={[0.11, 0.15, 0.13, 20]} />
                  <meshStandardMaterial color="#33302b" roughness={0.55} />
                </mesh>
                <pointLight intensity={4.5} distance={5.5} decay={2} color="#ffd9a6" />
              </group>
            );
          }),
        )}
      </Canvas>
    );
  },
);

export default SceneView;
