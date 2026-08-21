// サンプル間取り(平屋: 土間+廊下+和室3室)を生成して sample-minka.json に書き出す
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

// 全体 10920 x 5460 (12x6モジュール, 910mm)
// 土間: x0..2730 全奥行 / 廊下: y0..910 (x2730..10920) / 和室3室: y910..5460 幅2730ずつ
const polylines = [
  // 外周
  [[0, 0], [2730, 0], [10920, 0]],
  [[10920, 0], [10920, 910], [10920, 5460]],
  [[10920, 5460], [8190, 5460], [5460, 5460], [2730, 5460], [0, 5460]],
  [[0, 5460], [0, 0]],
  // 土間の間仕切り x=2730
  [[2730, 0], [2730, 910], [2730, 5460]],
  // 廊下の間仕切り y=910
  [[2730, 910], [5460, 910], [8190, 910], [10920, 910]],
  // 和室の間仕切り
  [[5460, 910], [5460, 5460]],
  [[8190, 910], [8190, 5460]],
];

const OUTER = new Set([0, 1, 2, 3].map(String)); // 外周ポリラインのindex

const nodeIdByKey = new Map();
const nodes = [];
function nodeId(x, y) {
  const key = x + ',' + y;
  if (!nodeIdByKey.has(key)) {
    const id = 'n' + (nodes.length + 1);
    nodeIdByKey.set(key, id);
    nodes.push({ id, x, y, confidence: 'estimated' });
  }
  return nodeIdByKey.get(key);
}

const walls = [];
const wallIdBySeg = new Map();
polylines.forEach((line, li) => {
  for (let i = 0; i < line.length - 1; i++) {
    const [x1, y1] = line[i];
    const [x2, y2] = line[i + 1];
    const a = nodeId(x1, y1);
    const b = nodeId(x2, y2);
    const id = 'w' + (walls.length + 1);
    walls.push({
      id, a, b,
      thickness: 120,
      confidence: 'estimated',
      structural: OUTER.has(String(li)) ? 'suspected' : 'unknown',
    });
    wallIdBySeg.set(`${x1},${y1}|${x2},${y2}`, id);
  }
});

function wallOf(x1, y1, x2, y2) {
  return wallIdBySeg.get(`${x1},${y1}|${x2},${y2}`) ?? wallIdBySeg.get(`${x2},${y2}|${x1},${y1}`);
}

const openings = [
  { id: 'o1', wallId: wallOf(0, 0, 2730, 0), offset: 760, width: 1200, height: 2000, sillHeight: 0, kind: 'entrance', confidence: 'estimated' },
  { id: 'o2', wallId: wallOf(5460, 5460, 8190, 5460), offset: 540, width: 1650, height: 1100, sillHeight: 800, kind: 'window', confidence: 'estimated' },
  { id: 'o3', wallId: wallOf(2730, 910, 5460, 910), offset: 900, width: 900, height: 1900, sillHeight: 0, kind: 'door', confidence: 'estimated' },
  { id: 'o4', wallId: wallOf(0, 5460, 0, 0), offset: 1800, width: 1650, height: 1100, sillHeight: 800, kind: 'window', confidence: 'estimated' },
];

const level = {
  id: 'L1',
  name: '1階',
  heightMm: 2400,
  walls,
  nodes,
  openings,
  rooms: [],
  nameHints: [
    { x: 1365, y: 2730, name: '土間' },
    { x: 6825, y: 455, name: '廊下' },
    { x: 4095, y: 3185, name: '和室A' },
    { x: 6825, y: 3185, name: '和室B' },
    { x: 9555, y: 3185, name: '和室C' },
  ],
};

const model = {
  id: 'sample-minka',
  levels: [level],
  moduleMm: 910,
  scaleFactor: 1,
  version: 1,
};

const payload = { schema: 'hiraku/space-model', version: 1, model };
writeFileSync(join(here, 'sample-minka.json'), JSON.stringify(payload, null, 2));
console.log('nodes:', nodes.length, 'walls:', walls.length);
