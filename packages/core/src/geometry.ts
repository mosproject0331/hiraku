export interface XY {
  x: number;
  y: number;
}

/** 符号付き面積(mm^2)。シューレース公式 */
export function signedAreaMm2(pts: XY[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

export function dist(a: XY, b: XY): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function centroid(pts: XY[]): XY {
  let x = 0;
  let y = 0;
  for (const p of pts) {
    x += p.x;
    y += p.y;
  }
  return { x: x / pts.length, y: y / pts.length };
}

/** レイキャスティング法 */
export function pointInPolygon(p: XY, poly: XY[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/** 面積加重の多角形重心 */
export function polygonCentroid(pts: XY[]): XY {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const q = pts[(i + 1) % pts.length]!;
    const cross = p.x * q.y - q.x * p.y;
    a += cross;
    cx += (p.x + q.x) * cross;
    cy += (p.y + q.y) * cross;
  }
  a /= 2;
  if (Math.abs(a) < 1) return pts[0] ?? { x: 0, y: 0 };
  return { x: cx / (6 * a), y: cy / (6 * a) };
}

/** 点から線分までの距離 */
export function distToSegment(p: XY, a: XY, b: XY): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-9) return dist(p, a);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return dist(p, { x: a.x + dx * t, y: a.y + dy * t });
}

/** 点から多角形の辺までの最短距離（内外は問わない） */
export function distToEdges(p: XY, poly: XY[]): number {
  let m = Infinity;
  for (let i = 0; i < poly.length; i++) {
    m = Math.min(m, distToSegment(p, poly[i]!, poly[(i + 1) % poly.length]!));
  }
  return m;
}

/**
 * 多角形の「いちばん奥まった点」を返す。
 * L字など凹んだ形では重心が外に出るため、格子状に探して壁から最も離れた内部点を選ぶ。
 */
export function poleOfInaccessibility(poly: XY[], steps = 24): XY {
  const xs = poly.map((p) => p.x);
  const ys = poly.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  let best: XY = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
  let bestD = -Infinity;
  for (let i = 0; i <= steps; i++) {
    for (let j = 0; j <= steps; j++) {
      const p = {
        x: minX + ((maxX - minX) * i) / steps,
        y: minY + ((maxY - minY) * j) / steps,
      };
      if (!pointInPolygon(p, poly)) continue;
      const d = distToEdges(p, poly);
      if (d > bestD) {
        bestD = d;
        best = p;
      }
    }
  }
  return best;
}
