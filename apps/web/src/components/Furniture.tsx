'use client';

import { memo, useMemo } from 'react';
import * as THREE from 'three';
import { RoundedBox } from '@react-three/drei';
import type { Plant, Prop } from '@/lib/entourage';

/**
 * 添景の家具。寸法は「だいたいの実物大」で、広さの見当をつけるために置く。
 * 角に丸みを付けてあるのは、直方体のままだと光が乗らず作り物に見えるため。
 */

function useKit() {
  return useMemo(() => {
    const std = (color: string, roughness: number, metalness = 0) =>
      new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness, metalness });
    return {
      woodLight: std('#b38c5d', 0.62),
      woodMid: std('#8a6740', 0.6),
      woodDark: std('#5c422e', 0.58),
      fabric: std('#8d8578', 0.94),
      fabricWarm: std('#a3907a', 0.95),
      linen: std('#e6e0d4', 0.96),
      metal: std('#3f4247', 0.34, 0.85),
      brass: std('#b08d4f', 0.3, 0.8),
      paper: std('#f2ece0', 0.92),
      stone: std('#8e8b85', 0.7),
      leaf: std('#5c7247', 0.88),
      leafDeep: std('#3f5636', 0.9),
      pot: std('#9a6b52', 0.8),
      shadeIn: new THREE.MeshStandardMaterial({
        color: new THREE.Color('#fff3df'), roughness: 0.9,
        emissive: new THREE.Color('#ffd9a0'), emissiveIntensity: 0.9, side: THREE.DoubleSide,
      }),
    };
  }, []);
}

type Kit = ReturnType<typeof useKit>;

function B({
  w, h, d, x = 0, y = 0, z = 0, ry = 0, m, r = 0.014,
}: { w: number; h: number; d: number; x?: number; y?: number; z?: number; ry?: number; m: THREE.Material; r?: number }) {
  const rad = Math.min(r, w / 2.2, h / 2.2, d / 2.2);
  return (
    <RoundedBox
      args={[w, h, d]}
      radius={Math.max(0.002, rad)}
      smoothness={2}
      position={[x, y, z]}
      rotation={[0, ry, 0]}
      material={m}
      castShadow
      receiveShadow
    />
  );
}

function Legs({ w, d, h, m, size = 0.045 }: { w: number; d: number; h: number; m: THREE.Material; size?: number }) {
  const ox = w / 2 - size;
  const oz = d / 2 - size;
  return (
    <>
      {[[-ox, -oz], [ox, -oz], [-ox, oz], [ox, oz]].map(([x, z], i) => (
        <B key={i} w={size} h={h} d={size} x={x} y={h / 2} z={z} m={m} r={0.004} />
      ))}
    </>
  );
}

function Table({ k, s = 1 }: { k: Kit; s?: number }) {
  const w = 1.4 * s;
  const d = 0.78;
  return (
    <group>
      <B w={w} h={0.038} d={d} y={0.72} m={k.woodLight} />
      <Legs w={w - 0.1} d={d - 0.1} h={0.7} m={k.woodMid} />
    </group>
  );
}

function Chair({ k }: { k: Kit }) {
  return (
    <group>
      <B w={0.44} h={0.045} d={0.44} y={0.44} m={k.woodLight} />
      <B w={0.42} h={0.44} d={0.035} y={0.67} z={-0.2} m={k.woodMid} />
      <Legs w={0.4} d={0.4} h={0.42} m={k.woodMid} size={0.035} />
    </group>
  );
}

function Stool({ k }: { k: Kit }) {
  return (
    <group>
      <mesh position={[0, 0.45, 0]} castShadow receiveShadow material={k.woodLight}>
        <cylinderGeometry args={[0.17, 0.17, 0.04, 20]} />
      </mesh>
      {[0, 1, 2].map((i) => {
        const a = (i / 3) * Math.PI * 2;
        return (
          <mesh
            key={i}
            position={[Math.cos(a) * 0.12, 0.22, Math.sin(a) * 0.12]}
            rotation={[Math.cos(a) * 0.1, 0, -Math.sin(a) * 0.1]}
            castShadow
            material={k.woodMid}
          >
            <cylinderGeometry args={[0.018, 0.022, 0.44, 8]} />
          </mesh>
        );
      })}
    </group>
  );
}

function Sofa({ k }: { k: Kit }) {
  return (
    <group>
      <B w={1.9} h={0.34} d={0.82} y={0.21} m={k.fabric} r={0.05} />
      <B w={1.9} h={0.46} d={0.18} y={0.6} z={-0.32} m={k.fabric} r={0.05} />
      <B w={0.17} h={0.24} d={0.82} x={-0.87} y={0.5} m={k.fabric} r={0.06} />
      <B w={0.17} h={0.24} d={0.82} x={0.87} y={0.5} m={k.fabric} r={0.06} />
      <B w={0.58} h={0.12} d={0.62} x={-0.42} y={0.44} m={k.fabricWarm} r={0.05} />
      <B w={0.58} h={0.12} d={0.62} x={0.42} y={0.44} m={k.fabricWarm} r={0.05} />
      <B w={0.34} h={0.34} d={0.12} x={-0.6} y={0.56} z={-0.2} ry={0.3} m={k.linen} r={0.05} />
    </group>
  );
}

function Counter({ k }: { k: Kit }) {
  return (
    <group>
      <B w={2.3} h={0.86} d={0.62} y={0.43} m={k.woodMid} r={0.01} />
      <B w={2.42} h={0.05} d={0.72} y={0.89} m={k.woodDark} r={0.012} />
      <B w={2.2} h={0.02} d={0.5} y={0.3} m={k.woodDark} r={0.004} />
    </group>
  );
}

function Shelf({ k, books }: { k: Kit; books?: boolean }) {
  const h = books ? 2.0 : 1.72;
  const shelves = books ? 5 : 4;
  return (
    <group>
      <B w={0.05} h={h} d={0.3} x={-0.44} y={h / 2} m={k.woodMid} r={0.006} />
      <B w={0.05} h={h} d={0.3} x={0.44} y={h / 2} m={k.woodMid} r={0.006} />
      <B w={0.92} h={0.03} d={0.32} y={h} m={k.woodMid} r={0.006} />
      {Array.from({ length: shelves }, (_, i) => {
        const y = ((i + 1) / (shelves + 1)) * h;
        return (
          <group key={i}>
            <B w={0.85} h={0.026} d={0.3} y={y} m={k.woodLight} r={0.005} />
            {books &&
              Array.from({ length: 9 }, (_, j) => {
                const bh = 0.19 + ((i * 7 + j * 13) % 5) * 0.014;
                const bw = 0.032 + ((j * 5 + i) % 4) * 0.008;
                const tone = [k.woodDark, k.fabricWarm, k.stone, k.linen, k.woodMid][(i * 3 + j) % 5]!;
                return (
                  <B key={j} w={bw} h={bh} d={0.2} x={-0.38 + j * 0.085} y={y + bh / 2 + 0.014} m={tone} r={0.003} />
                );
              })}
          </group>
        );
      })}
    </group>
  );
}

function Rug({ k, s = 1 }: { k: Kit; s?: number }) {
  return <B w={2.1 * s} h={0.014} d={1.5 * s} y={0.007} m={k.fabricWarm} r={0.004} />;
}

function LowTable({ k }: { k: Kit }) {
  return (
    <group>
      <B w={0.96} h={0.035} d={0.58} y={0.35} m={k.woodLight} />
      <Legs w={0.84} d={0.46} h={0.34} m={k.woodMid} size={0.04} />
    </group>
  );
}

function Cushion({ k }: { k: Kit }) {
  return <B w={0.56} h={0.09} d={0.56} y={0.05} m={k.fabricWarm} r={0.035} />;
}

function Futon({ k }: { k: Kit }) {
  return (
    <group>
      <B w={1.0} h={0.16} d={0.74} y={0.08} m={k.linen} r={0.03} />
      <B w={0.98} h={0.14} d={0.72} y={0.23} m={k.paper} r={0.03} />
      <B w={0.5} h={0.1} d={0.34} y={0.35} z={0.1} ry={0.2} m={k.linen} r={0.035} />
    </group>
  );
}

function Bed({ k }: { k: Kit }) {
  return (
    <group>
      <B w={1.0} h={0.24} d={1.98} y={0.12} m={k.woodMid} r={0.01} />
      <B w={1.0} h={0.18} d={1.98} y={0.33} m={k.linen} r={0.03} />
      <B w={0.96} h={0.06} d={1.2} y={0.44} z={0.36} m={k.paper} r={0.03} />
      <B w={0.6} h={0.11} d={0.34} y={0.47} z={-0.75} m={k.linen} r={0.04} />
    </group>
  );
}

function Plant({ k, s = 1 }: { k: Kit; s?: number }) {
  return (
    <group scale={s}>
      <mesh position={[0, 0.13, 0]} castShadow receiveShadow material={k.pot}>
        <cylinderGeometry args={[0.18, 0.14, 0.26, 18]} />
      </mesh>
      {[
        [0, 0.55, 0, 0.3],
        [0.14, 0.75, 0.06, 0.22],
        [-0.12, 0.68, -0.09, 0.19],
        [0.05, 0.9, -0.05, 0.15],
      ].map(([x, y, z, r], i) => (
        <mesh
          key={i}
          position={[x!, y!, z!]}
          scale={[1, 0.82, 1]}
          castShadow
          material={i % 2 ? k.leafDeep : k.leaf}
        >
          <icosahedronGeometry args={[r!, 1]} />
        </mesh>
      ))}
    </group>
  );
}

function Pendant({ k, h, on }: { k: Kit; h: number; on: boolean }) {
  return (
    <group position={[0, h - 0.62, 0]}>
      <mesh material={k.metal} position={[0, 0.31, 0]}>
        <cylinderGeometry args={[0.006, 0.006, 0.62, 6]} />
      </mesh>
      <mesh castShadow material={k.metal}>
        <coneGeometry args={[0.19, 0.2, 24, 1, true]} />
      </mesh>
      <mesh position={[0, -0.005, 0]} material={k.shadeIn}>
        <coneGeometry args={[0.185, 0.19, 24, 1, true]} />
      </mesh>
      {on && <pointLight position={[0, -0.12, 0]} intensity={7} distance={7} decay={2} color="#ffd7a3" castShadow={false} />}
    </group>
  );
}

function FloorLamp({ k, on }: { k: Kit; on: boolean }) {
  return (
    <group>
      <mesh position={[0, 0.02, 0]} material={k.metal} receiveShadow>
        <cylinderGeometry args={[0.15, 0.17, 0.04, 20]} />
      </mesh>
      <mesh position={[0, 0.7, 0]} material={k.metal} castShadow>
        <cylinderGeometry args={[0.014, 0.014, 1.36, 8]} />
      </mesh>
      <mesh position={[0, 1.45, 0]} material={k.shadeIn} castShadow>
        <cylinderGeometry args={[0.17, 0.21, 0.26, 22, 1, true]} />
      </mesh>
      {on && <pointLight position={[0, 1.4, 0]} intensity={4} distance={5} decay={2} color="#ffcf96" />}
    </group>
  );
}

function Workbench({ k }: { k: Kit }) {
  return (
    <group>
      <B w={1.9} h={0.07} d={0.78} y={0.86} m={k.woodDark} r={0.008} />
      <B w={1.7} h={0.03} d={0.6} y={0.3} m={k.woodMid} r={0.006} />
      <Legs w={1.78} d={0.68} h={0.84} m={k.woodDark} size={0.07} />
      <B w={0.3} h={0.1} d={0.22} x={-0.6} y={0.95} m={k.metal} r={0.01} />
      <B w={0.22} h={0.16} d={0.18} x={0.55} y={0.98} ry={0.4} m={k.stone} r={0.01} />
    </group>
  );
}

function DisplayTable({ k }: { k: Kit }) {
  return (
    <group>
      <B w={1.2} h={0.04} d={0.62} y={0.78} m={k.woodLight} />
      <B w={1.1} h={0.03} d={0.52} y={0.34} m={k.woodMid} r={0.005} />
      <Legs w={1.1} d={0.52} h={0.76} m={k.woodMid} size={0.04} />
      <B w={0.2} h={0.16} d={0.2} x={-0.32} y={0.88} m={k.linen} r={0.02} />
      <B w={0.16} h={0.1} d={0.16} x={0.16} y={0.85} ry={0.5} m={k.stone} r={0.02} />
    </group>
  );
}

function Bench({ k }: { k: Kit }) {
  return (
    <group>
      <B w={1.5} h={0.05} d={0.38} y={0.42} m={k.woodLight} />
      <B w={0.06} h={0.4} d={0.36} x={-0.66} y={0.2} m={k.woodMid} r={0.006} />
      <B w={0.06} h={0.4} d={0.36} x={0.66} y={0.2} m={k.woodMid} r={0.006} />
    </group>
  );
}

const ONE = memo(function One({ p, k, h, on }: { p: Prop; k: Kit; h: number; on: boolean }) {
  const s = p.s ?? 1;
  const body = (() => {
    switch (p.kind) {
      case 'table': return <Table k={k} s={s} />;
      case 'chair': return <Chair k={k} />;
      case 'stool': return <Stool k={k} />;
      case 'sofa': return <Sofa k={k} />;
      case 'counter': return <Counter k={k} />;
      case 'shelf': return <Shelf k={k} />;
      case 'bookshelf': return <Shelf k={k} books />;
      case 'rug': return <Rug k={k} s={s} />;
      case 'lowTable': return <LowTable k={k} />;
      case 'cushion': return <Cushion k={k} />;
      case 'futon': return <Futon k={k} />;
      case 'bed': return <Bed k={k} />;
      case 'plant': return <Plant k={k} s={s} />;
      case 'pendant': return <Pendant k={k} h={h} on={on} />;
      case 'floorLamp': return <FloorLamp k={k} on={on} />;
      case 'bench': return <Bench k={k} />;
      case 'workbench': return <Workbench k={k} />;
      case 'displayTable': return <DisplayTable k={k} />;
      default: return null;
    }
  })();
  return (
    <group position={[p.x, 0, p.z]} rotation={[0, p.rot, 0]}>
      {body}
    </group>
  );
});

export function Entourage({ props: items, height, lightsOn }: { props: Prop[]; height: number; lightsOn: boolean }) {
  const k = useKit();
  return (
    <>
      {items.map((p, i) => (
        <ONE key={`${p.kind}-${i}`} p={p} k={k} h={height} on={lightsOn} />
      ))}
    </>
  );
}

/** 窓の外の緑。低木と木の2種類だけで十分に「外がある」感じが出る */
export function Vegetation({ plants }: { plants: Plant[] }) {
  const k = useKit();
  return (
    <>
      {plants.map((p, i) => (
        <group key={i} position={[p.x, 0, p.z]} rotation={[0, p.rot, 0]}>
          {p.kind === 1 && (
            <mesh position={[0, p.h * 0.34, 0]} castShadow material={k.woodDark}>
              <cylinderGeometry args={[p.r * 0.1, p.r * 0.16, p.h * 0.68, 8]} />
            </mesh>
          )}
          <mesh
            position={[0, p.kind === 1 ? p.h * 0.76 : p.h * 0.5, 0]}
            scale={[1, p.kind === 1 ? 0.9 : 0.7, 1]}
            castShadow
            material={i % 2 ? k.leafDeep : k.leaf}
          >
            <icosahedronGeometry args={[p.r, 2]} />
          </mesh>
        </group>
      ))}
    </>
  );
}
