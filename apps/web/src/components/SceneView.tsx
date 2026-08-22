'use client';

import {
  forwardRef, useEffect, useImperativeHandle, useMemo, useRef,
} from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { Bloom, EffectComposer, N8AO, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode, type EffectComposer as PostComposer } from 'postprocessing';
import type { CameraSpec, RenovationScene, Site } from '@hiraku/core';
import { buildBuilding, type Building, type LightKey, type WindowLight } from '@/lib/archviz';
import { buildShell } from '@/lib/shell';
import { setFinishTextureSize } from '@/lib/finish-material';
import { layoutPlants, layoutProps } from '@/lib/entourage';
import { Entourage, Vegetation } from '@/components/Furniture';
import { profileFor, type QualityProfile } from '@/lib/quality';

export interface SceneViewHandle {
  /** いまの見え方をPNGで取り出す（写実化の下絵に使う） */
  capture: () => Promise<string | null>;
}

/** 時刻ごとの空と地面の色。窓の外の明るさがそのまま室内の印象を決める */
const SKY: Record<
  LightKey,
  { zenith: string; horizon: string; ground: string; hemi: number; env: number; rect: number }
> = {
  morning: { zenith: '#8fb4dc', horizon: '#f4e2c6', ground: '#8b8a72', hemi: 0.12, env: 0.3,  rect: 1.05 },
  noon:    { zenith: '#7ba7dd', horizon: '#dfeaf3', ground: '#8f9077', hemi: 0.15, env: 0.36, rect: 1.35 },
  evening: { zenith: '#5d7fae', horizon: '#f0c089', ground: '#6f6a58', hemi: 0.08, env: 0.21, rect: 0.8 },
  night:   { zenith: '#0e1626', horizon: '#25303f', ground: '#20241f', hemi: 0.03, env: 0.05, rect: 0.25 },
};

/* ---------------- 環境光（室内の回り込み） ---------------- */

function Env({ intensity }: { intensity: number }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const rt = pmrem.fromScene(room, 0.04);
    scene.environment = rt.texture;
    invalidate();
    return () => {
      scene.environment = null;
      rt.dispose();
      pmrem.dispose();
      room.dispose?.();
    };
  }, [gl, scene, invalidate]);
  useEffect(() => {
    scene.environmentIntensity = intensity;
    invalidate();
  }, [scene, intensity, invalidate]);
  return null;
}

/* ---------------- 空と地面 ---------------- */

function Sky({ light, radius }: { light: LightKey; radius: number }) {
  const c = SKY[light];
  const mat = useMemo(() => {
    const m = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        zenith: { value: new THREE.Color(c.zenith) },
        horizon: { value: new THREE.Color(c.horizon) },
        ground: { value: new THREE.Color(c.ground) },
      },
      vertexShader: `
        varying vec3 vP;
        void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        uniform vec3 zenith; uniform vec3 horizon; uniform vec3 ground;
        varying vec3 vP;
        void main(){
          float h = normalize(vP).y;
          vec3 col = h > 0.0
            ? mix(horizon, zenith, pow(clamp(h,0.0,1.0), 0.55))
            : mix(horizon, ground, clamp(-h*4.0,0.0,1.0));
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    return m;
  }, [c.zenith, c.horizon, c.ground]);
  useEffect(() => () => mat.dispose(), [mat]);

  const groundMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: new THREE.Color(c.ground), roughness: 0.98 }),
    [c.ground],
  );
  useEffect(() => () => groundMat.dispose(), [groundMat]);

  const R = Math.max(80, radius * 14);
  return (
    <>
      <mesh material={mat} renderOrder={-1}>
        <sphereGeometry args={[R, 24, 16]} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow material={groundMat}>
        <circleGeometry args={[R * 0.6, 40]} />
      </mesh>
    </>
  );
}

/* ---------------- 窓からの面光源 ---------------- */

function RectLight({ w, color, intensity }: { w: WindowLight; color: string; intensity: number }) {
  const ref = useRef<THREE.RectAreaLight>(null);
  useEffect(() => {
    const l = ref.current;
    if (!l) return;
    l.lookAt(w.position[0] + w.normal[0], w.position[1], w.position[2] + w.normal[2]);
  });
  return (
    <rectAreaLight
      ref={ref}
      position={w.position}
      args={[new THREE.Color(color).getHex(), intensity, w.width, w.height]}
    />
  );
}

function WindowLights({ windows, light, gain }: { windows: WindowLight[]; light: LightKey; gain: number }) {
  useMemo(() => RectAreaLightUniformsLib.init(), []);
  const top = useMemo(
    () => [...windows].sort((a, b) => b.width * b.height - a.width * a.height).slice(0, 3),
    [windows],
  );
  const night = light === 'night';
  return (
    <>
      {top.map((w, i) => (
        <RectLight
          key={i}
          w={w}
          color={night ? '#7f93bb' : light === 'evening' ? '#ffd6a8' : '#dceaff'}
          intensity={gain * (1 - i * 0.32)}
        />
      ))}
    </>
  );
}

/** 太陽が建物のまん中を向くようにする（既定の原点だと影がずれる） */
const sunTargetObject = new THREE.Object3D();
function SunTarget({ at }: { at: [number, number, number] }) {
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    sunTargetObject.position.set(at[0], at[1], at[2]);
    sunTargetObject.updateMatrixWorld();
    scene.add(sunTargetObject);
    return () => {
      scene.remove(sunTargetObject);
    };
  }, [scene, at]);
  return null;
}

/* ---------------- 躯体 ---------------- */

function Shell({ building, transmission }: { building: Building; transmission: boolean }) {
  const invalidate = useThree((s) => s.invalidate);
  const shell = useMemo(() => buildShell(building, { transmission }), [building, transmission]);
  useEffect(() => {
    invalidate();
    return () => shell.dispose();
  }, [shell, invalidate]);
  return <primitive object={shell.group} />;
}

/* ---------------- カメラ ---------------- */

/** 天地を起こしたまま見回す。垂直線が倒れないのが建築の写真の基本 */
function CameraRig({ cam, shift = 0.06 }: { cam: CameraSpec; shift?: number }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const gl = useThree((s) => s.gl);
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  const yaw = useRef(0);
  const pitch = useRef(0);
  const fov = useRef(cam.fovDeg);
  const K = 0.32;

  const apply = useRef(() => {});
  apply.current = () => {
    camera.position.set(cam.position[0], cam.position[1], cam.position[2]);
    camera.rotation.set(pitch.current, yaw.current, 0, 'YXZ');
    camera.fov = (Math.atan((1 + K) * Math.tan((fov.current * Math.PI) / 360)) * 360) / Math.PI;
    camera.setViewOffset(
      size.width * (1 + K), size.height * (1 + K),
      (size.width * K) / 2, (size.height * K * (1 - shift)) / 2,
      size.width, size.height,
    );
    camera.updateProjectionMatrix();
    invalidate();
  };

  useEffect(() => {
    const dx = cam.target[0] - cam.position[0];
    const dz = cam.target[2] - cam.position[2];
    yaw.current = Math.atan2(-dx, -dz);
    pitch.current = 0;
    fov.current = cam.fovDeg;
    apply.current();
  }, [cam, size.width, size.height]);

  // 見回す操作。横に振る動きだけ受け取り、縦のスワイプは画面の送りに残す
  useEffect(() => {
    const el = gl.domElement;
    let id: number | null = null;
    let lastX = 0;
    let lastY = 0;
    let claimed: boolean | null = null;
    let pinch = 0;

    const dist = (t: TouchList) =>
      Math.hypot(t[0]!.clientX - t[1]!.clientX, t[0]!.clientY - t[1]!.clientY);

    const down = (e: PointerEvent) => {
      if (id !== null) return;
      id = e.pointerId;
      lastX = e.clientX;
      lastY = e.clientY;
      claimed = e.pointerType === 'mouse' ? true : null;
    };
    const move = (e: PointerEvent) => {
      if (id !== e.pointerId) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      if (claimed === null) {
        if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
        claimed = Math.abs(dx) > Math.abs(dy) * 1.15;
        if (claimed) el.setPointerCapture(e.pointerId);
      }
      if (!claimed) return;
      lastX = e.clientX;
      lastY = e.clientY;
      yaw.current -= (dx / el.clientWidth) * 1.6;
      pitch.current = Math.max(-0.26, Math.min(0.2, pitch.current - (dy / el.clientHeight) * 0.7));
      apply.current();
    };
    const up = (e: PointerEvent) => {
      if (id === e.pointerId) id = null;
    };
    const tStart = (e: TouchEvent) => {
      if (e.touches.length === 2) pinch = dist(e.touches);
    };
    const tMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !pinch) return;
      e.preventDefault();
      const d = dist(e.touches);
      fov.current = Math.max(28, Math.min(88, fov.current * (pinch / d)));
      pinch = d;
      apply.current();
    };
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey && Math.abs(e.deltaY) < 2) return;
      if (!e.ctrlKey) return;
      e.preventDefault();
      fov.current = Math.max(28, Math.min(88, fov.current + e.deltaY * 0.05));
      apply.current();
    };

    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('touchstart', tStart, { passive: true });
    el.addEventListener('touchmove', tMove, { passive: false });
    el.addEventListener('wheel', wheel, { passive: false });
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('touchstart', tStart);
      el.removeEventListener('touchmove', tMove);
      el.removeEventListener('wheel', wheel);
    };
  }, [gl]);

  return null;
}

/* ---------------- 書き出し ---------------- */

/** 送る前に長辺を詰めてJPEGにする。回線の細いところでも待たされないため */
function toCompact(canvas: HTMLCanvasElement, maxEdge = 1400, quality = 0.92): string {
  const scale = Math.min(1, maxEdge / Math.max(canvas.width, canvas.height));
  if (scale >= 1) {
    try {
      return canvas.toDataURL('image/jpeg', quality);
    } catch {
      return canvas.toDataURL('image/png');
    }
  }
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(canvas.width * scale));
  out.height = Math.max(1, Math.round(canvas.height * scale));
  const ctx = out.getContext('2d');
  if (!ctx) return canvas.toDataURL('image/png');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(canvas, 0, 0, out.width, out.height);
  return out.toDataURL('image/jpeg', quality);
}

/**
 * いまの見え方を1枚の絵にする。
 *
 * 描き直しの合図を待たず、その場で合成まで走らせて読み出す。
 * 書き出しのあいだだけ解像度を上げるので、端末が違っても同じ大きさの絵になる。
 */
function Capturer({
  handle, composer, target = 1400,
}: {
  handle: React.RefObject<SceneViewHandle | null>;
  composer: React.RefObject<PostComposer | null>;
  target?: number;
}) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);

  handle.current = {
    capture: async () => {
      const canvas = gl.domElement;
      const w = size.width || canvas.clientWidth;
      const h = size.height || canvas.clientHeight;
      if (!w || !h) return null;
      const prevRatio = gl.getPixelRatio();
      const wanted = Math.max(1, Math.min(4, target / Math.max(w, h)));
      try {
        if (Math.abs(wanted - prevRatio) > 0.01) {
          gl.setPixelRatio(wanted);
          composer.current?.setSize(w, h);
        }
        if (composer.current) composer.current.render();
        else gl.render(scene, camera);
        return toCompact(canvas, target);
      } catch {
        return null;
      } finally {
        if (Math.abs(wanted - prevRatio) > 0.01) {
          gl.setPixelRatio(prevRatio);
          composer.current?.setSize(w, h);
          if (composer.current) composer.current.render();
          else gl.render(scene, camera);
        }
      }
    },
  };
  return null;
}

/** 開発時だけ、シーンの中身を外から確かめられるようにしておく */
function DevHandle({
  building, props: items, cams, capture,
}: {
  building: Building; props: unknown; cams: unknown;
  capture: React.RefObject<SceneViewHandle | null>;
}) {
  const state = useThree();
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    (window as unknown as { __hiraku3d?: unknown }).__hiraku3d = {
      camera: state.camera,
      scene: state.scene,
      gl: state.gl,
      building,
      props: items,
      cams,
      capture: () => capture.current?.capture() ?? Promise.resolve(null),
    };
  }, [state, building, items, cams, capture]);
  return null;
}

/* ---------------- 本体 ---------------- */

export interface SceneViewProps {
  scene: RenovationScene;
  camera: CameraSpec;
  light?: LightKey;
  quality: QualityProfile;
  /** 用途。家具の並べ方が変わる */
  use?: string;
  /** 敷地。決まっていれば太陽は本当の位置になる */
  site?: Site | null;
  /** 見たい日（季節）。既定は今日 */
  when?: Date;
}

const SceneView = forwardRef<SceneViewHandle, SceneViewProps>(function SceneView(
  { scene, camera, light = 'noon', quality, use, site, when },
  ref,
) {
  const handle = useRef<SceneViewHandle | null>(null);
  const composerRef = useRef<PostComposer | null>(null);
  useImperativeHandle(ref, () => ({ capture: () => handle.current?.capture() ?? Promise.resolve(null) }), []);

  // 素材の細かさは端末に合わせる。作り直しが要るので、組み立ての前に決める
  setFinishTextureSize(quality.texSize);
  const building = useMemo(
    () =>
      buildBuilding(scene, light, { position: camera.position, target: camera.target }, site, when),
    [scene, light, camera, site, when],
  );
  // カメラの前 1.4m には家具を置かない（レンズに被って構図が壊れるため）
  const avoid = useMemo(
    () => scene.cameras.map((c) => ({ x: c.position[0], z: c.position[2], r: 1.4 })),
    [scene.cameras],
  );
  const props = useMemo(
    () => (quality.entourage && building ? layoutProps(building.rooms, use, avoid) : []),
    [building, use, avoid, quality.entourage],
  );
  const plants = useMemo(
    () => (building ? layoutPlants(building.windows, building.bounds) : []),
    [building],
  );

  if (!building) return null;
  const sky = SKY[light];
  const night = light === 'night';

  return (
    <Canvas
      frameloop="demand"
      dpr={[1, quality.dprMax]}
      shadows={quality.shadows}
      gl={{
        preserveDrawingBuffer: true,
        antialias: quality.msaa === 0 && !quality.ao,
        powerPreference: 'high-performance',
        alpha: false,
      }}
      camera={{ fov: camera.fovDeg, near: 0.06, far: Math.max(200, building.bounds.r * 40) }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.NoToneMapping; // 色調整は合成側でまとめて行う
        // 視錐台を建物ぎりぎりに詰めてあるので、PCFSoft で窓の陽だまりがはっきり出る
        gl.shadowMap.type = THREE.PCFSoftShadowMap;
      }}
    >
      <Env intensity={sky.env} />
      <Sky light={light} radius={building.bounds.r} />
      <CameraRig cam={camera} />
      <Capturer handle={handle} composer={composerRef} />
      <DevHandle building={building} props={props} cams={scene.cameras} capture={handle} />

      <ambientLight intensity={0.03} />
      <hemisphereLight args={[sky.zenith, sky.ground, sky.hemi]} />
      <directionalLight
        position={building.sun.position}
        intensity={building.sun.intensity}
        color={building.sun.color}
        target={sunTargetObject}
        castShadow={quality.shadows}
        shadow-mapSize={[quality.shadowMap, quality.shadowMap]}
        shadow-camera-near={Math.max(0.5, building.sun.distance - building.sun.radius - 2)}
        shadow-camera-far={building.sun.distance + building.sun.radius + 4}
        shadow-camera-left={-building.sun.radius}
        shadow-camera-right={building.sun.radius}
        shadow-camera-top={building.sun.radius}
        shadow-camera-bottom={-building.sun.radius}
        shadow-bias={-0.00035}
        shadow-normalBias={0.022}
      />
      <SunTarget at={[building.bounds.cx, 1.1, building.bounds.cz]} />
      {/* 床で跳ね返った光の代わり。弱く下から当てると、天井と壁の下半分が沈まない */}
      <directionalLight
        position={[building.bounds.cx, -6, building.bounds.cz]}
        target={sunTargetObject}
        intensity={building.sun.intensity * 0.16}
        color={light === 'night' ? '#3d4a63' : '#ffe9cf'}
      />
      <WindowLights windows={building.windows} light={light} gain={sky.rect} />

      <Shell building={building} transmission={quality.transmission} />
      {quality.entourage && <Entourage props={props} height={building.height} lightsOn={night || light === 'evening'} />}
      <Vegetation plants={plants} />

      <EffectComposer
        ref={composerRef}
        multisampling={quality.msaa}
        enableNormalPass={quality.ao}
        frameBufferType={THREE.HalfFloatType}
      >
        {quality.ao ? (
          <N8AO
            aoRadius={0.7}
            distanceFalloff={0.9}
            intensity={4.6}
            color="#2b2419"
            halfRes={quality.tier !== 'high'}
            quality={quality.tier === 'high' ? 'high' : 'medium'}
          />
        ) : (
          <></>
        )}
        {quality.bloom ? (
          <Bloom intensity={night ? 0.6 : 0.24} luminanceThreshold={night ? 0.55 : 0.9} luminanceSmoothing={0.3} mipmapBlur />
        ) : (
          <></>
        )}
        <ToneMapping mode={ToneMappingMode.NEUTRAL} />
        <Vignette offset={0.28} darkness={0.42} eskil={false} />
        {quality.msaa === 0 ? <SMAA /> : <></>}
      </EffectComposer>
    </Canvas>
  );
});

export default SceneView;
export { profileFor };
