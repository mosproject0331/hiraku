import type { Backdrop } from './types';
import { dist, type XY } from './geometry';

/** 画像を、指定した幅(mm)で原点に置く初期状態をつくる */
export function initialBackdrop(
  src: string,
  pxWidth: number,
  pxHeight: number,
  assumedWidthMm = 9100,
): Backdrop {
  return {
    src,
    x: 0,
    y: 0,
    mmPerPx: assumedWidthMm / Math.max(1, pxWidth),
    opacity: 0.55,
    rotation: 0,
    pxWidth,
    pxHeight,
  };
}

/**
 * 実寸合わせ。下絵の上でクリックした2点（図面座標mm）が実際には realMm 離れている、
 * という情報から倍率を決め直す。p1 の位置は動かさない。
 */
export function calibrateBackdrop(b: Backdrop, p1: XY, p2: XY, realMm: number): Backdrop {
  const d = dist(p1, p2);
  if (d < 1 || realMm <= 0) return b;
  const k = realMm / d;
  return {
    ...b,
    mmPerPx: b.mmPerPx * k,
    x: p1.x - (p1.x - b.x) * k,
    y: p1.y - (p1.y - b.y) * k,
  };
}

/** 下絵の図面上での寸法(mm) */
export function backdropSizeMm(b: Backdrop): { widthMm: number; heightMm: number } {
  return { widthMm: b.pxWidth * b.mmPerPx, heightMm: b.pxHeight * b.mmPerPx };
}
