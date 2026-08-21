"""平面・線分の抽出。open3d等の重依存を避け、numpyのみで実装する。"""
from __future__ import annotations

import numpy as np


def find_floor_z(points: np.ndarray, bin_mm: float = 50.0) -> float:
    """zヒストグラムの最大ビン(下位側)を床とみなす"""
    z = points[:, 2]
    lo, hi = np.percentile(z, [1, 99])
    bins = max(8, int((hi - lo) / bin_mm))
    hist, edges = np.histogram(z, bins=bins, range=(lo, hi))
    # 下から探して最初の大きなピーク
    peak = int(np.argmax(hist))
    return float((edges[peak] + edges[peak + 1]) / 2)


def ransac_line(
    pts2d: np.ndarray,
    rng: np.random.Generator,
    iters: int = 300,
    tol_mm: float = 60.0,
) -> tuple[np.ndarray, np.ndarray] | None:
    """2D点群から最良の直線を1本探す。戻り値: (inlierマスク, [nx,ny,d]) nx*x+ny*y=d"""
    n = len(pts2d)
    if n < 30:
        return None
    best_mask: np.ndarray | None = None
    best_count = 0
    for _ in range(iters):
        i, j = rng.integers(0, n, 2)
        if i == j:
            continue
        p, q = pts2d[i], pts2d[j]
        d = q - p
        norm = np.hypot(d[0], d[1])
        if norm < 300:  # 近すぎるペアは不安定
            continue
        nvec = np.array([-d[1], d[0]]) / norm
        dist = np.abs((pts2d - p) @ nvec)
        mask = dist < tol_mm
        count = int(mask.sum())
        if count > best_count:
            best_count = count
            best_mask = mask
    if best_mask is None or best_count < 30:
        return None
    # inlierで最小二乗フィット(主成分)
    inl = pts2d[best_mask]
    c = inl.mean(axis=0)
    u, s, vt = np.linalg.svd(inl - c)
    direction = vt[0]
    nvec = np.array([-direction[1], direction[0]])
    dval = float(c @ nvec)
    # 最終inlier再計算
    dist = np.abs(pts2d @ nvec - dval)
    mask = dist < tol_mm
    return mask, np.array([nvec[0], nvec[1], dval])


def wall_band(points: np.ndarray, floor_z: float, height_mm: float = 2400.0) -> np.ndarray:
    """壁抽出に使う高さ帯(床・天井付近を除く)の点の2D射影"""
    z = points[:, 2]
    mask = (z > floor_z + 400) & (z < floor_z + height_mm - 400)
    return points[mask][:, :2]
