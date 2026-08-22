import {
  detectFaces,
  dist,
  polygonCentroid,
  type DamagePin,
  type Measurement,
  type SpaceModel,
} from '@hiraku/core';
import { DISCLAIMER, esc, htmlDoc } from './html';

const CONF_COLOR = { estimated: '#a8a29a', hypothesis: '#c08a12', measured: '#2f7a58' } as const;
const CONF_LABEL = { estimated: '推定', hypothesis: '仮説', measured: '実測' } as const;
const TYPE_LABEL: Record<Measurement['type'], string> = {
  wallLength: '壁の長さ',
  diagonal: '対角',
  ceilingHeight: '天井高',
  openingWidth: '開口幅',
  tilt: '傾き',
};

/** 平面図SVG(印刷用の簡易版) */
export function svgPlan(model: SpaceModel, pins: DamagePin[] = []): string {
  const level = model.levels[0];
  if (!level || level.nodes.length === 0) return '<p>(間取りなし)</p>';
  const nodeById = new Map(level.nodes.map((n) => [n.id, n] as const));
  const xs = level.nodes.map((n) => n.x);
  const ys = level.nodes.map((n) => n.y);
  const minX = Math.min(...xs) - 800;
  const minY = Math.min(...ys) - 800;
  const w = Math.max(...xs) - Math.min(...xs) + 1600;
  const h = Math.max(...ys) - Math.min(...ys) + 1600;

  const walls = level.walls
    .map((wl) => {
      const a = nodeById.get(wl.a);
      const b = nodeById.get(wl.b);
      if (!a || !b) return '';
      const len = dist(a, b);
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const nx = len > 0 ? (-(b.y - a.y) / len) * 300 : 0;
      const ny = len > 0 ? ((b.x - a.x) / len) * 300 : 0;
      return (
        `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${CONF_COLOR[wl.confidence]}" stroke-width="${wl.thickness}"/>` +
        (len >= 900
          ? `<text x="${mx + nx}" y="${my + ny}" font-size="260" fill="#64748b" text-anchor="middle">${(len / 1000).toFixed(2)}</text>`
          : '')
      );
    })
    .join('');

  const faces = detectFaces(level);
  const labels = faces
    .map((f, i) => {
      const room = level.rooms[i];
      if (!room) return '';
      const pts = f.nodeIds.map((id) => nodeById.get(id)!).filter(Boolean);
      const c = polygonCentroid(pts);
      return `<text x="${c.x}" y="${c.y}" font-size="320" text-anchor="middle" fill="#334155">${esc(room.name)} ${room.areaM2.toFixed(1)}㎡</text>`;
    })
    .join('');

  const pinMarks = pins
    .map(
      (p, i) =>
        `<circle cx="${p.x}" cy="${p.y}" r="220" fill="#dc2626" opacity="0.85"/>` +
        `<text x="${p.x}" y="${p.y + 110}" font-size="300" fill="#ffffff" text-anchor="middle" font-weight="bold">${i + 1}</text>`,
    )
    .join('');

  return `<svg viewBox="${minX} ${minY} ${w} ${h}" style="width:100%;max-height:480px;background:#fff;border:1px solid #e2e8f0">${walls}${labels}${pinMarks}</svg>`;
}

export function renderSurveyReport(
  model: SpaceModel,
  measurements: Measurement[],
  pins: DamagePin[],
  notes: string,
): string {
  const level = model.levels[0];
  const conf = { estimated: 0, hypothesis: 0, measured: 0 };
  if (level) for (const n of level.nodes) conf[n.confidence] += 1;

  const measRows = measurements
    .map(
      (m) =>
        `<tr><td>${esc(TYPE_LABEL[m.type])}</td><td style="text-align:right">${m.type === 'tilt' ? (m.valueMm / 10).toFixed(1) + '°' : m.valueMm.toLocaleString() + ' mm'}</td><td>${esc(m.note ?? '')}</td><td>${esc(m.createdAt.slice(0, 10))}</td></tr>`,
    )
    .join('');

  const pinRows = pins
    .map(
      (p, i) =>
        `<tr><td>${i + 1}</td><td>${esc(p.category)}</td><td>${esc(p.memo)}</td><td>${p.photoRef ? esc(p.photoRef) : '-'}</td></tr>`,
    )
    .join('');

  const body = `
    <h1>現況調査報告書</h1>
    <div class="meta">HIRAKU(仮称) / ノード確度: 実測${conf.measured} / 仮説${conf.hypothesis} / 推定${conf.estimated}</div>

    <h2>平面図(数字はm、色は確度: 緑=実測 黄=仮説 灰=推定、赤丸=劣化ピン)</h2>
    ${svgPlan(model, pins)}

    <h2>実測一覧(${measurements.length}件)</h2>
    ${
      measurements.length
        ? `<table><thead><tr><th>種別</th><th>値</th><th>メモ</th><th>日付</th></tr></thead><tbody>${measRows}</tbody></table>`
        : '<p>実測値はまだありません。</p>'
    }

    <h2>劣化・不具合ピン(${pins.length}件)</h2>
    ${
      pins.length
        ? `<table><thead><tr><th>#</th><th>分類</th><th>メモ</th><th>写真</th></tr></thead><tbody>${pinRows}</tbody></table>`
        : '<p>記録された劣化・不具合はありません。</p>'
    }

    <h2>所見</h2>
    <p>${esc(notes || '(未記入)')}</p>

    <div class="disclaimer">${esc(DISCLAIMER)} 図中の寸法・面積には推定値(グレー・黄)が含まれます。</div>
  `;
  return htmlDoc('現況調査報告書', body);
}
