"""壁平面→2D線分化→近接統合→マンハッタン整列"""
from __future__ import annotations

import numpy as np

from .planes import ransac_line


def extract_segments(
    pts2d: np.ndarray,
    max_walls: int = 12,
    min_inliers: int = 80,
    seed: int = 0,
) -> list[list[list[float]]]:
    """逐次RANSACで線分を抽出する"""
    rng = np.random.default_rng(seed)
    rest = pts2d.copy()
    segments: list[list[list[float]]] = []
    for _ in range(max_walls):
        res = ransac_line(rest, rng)
        if res is None:
            break
        mask, (nx, ny, d) = res
        if int(mask.sum()) < min_inliers:
            break
        inl = rest[mask]
        direction = np.array([ny, -nx])
        t = inl @ direction
        lo, hi = float(t.min()), float(t.max())
        base = np.array([nx, ny]) * d
        p1 = base + direction * lo
        p2 = base + direction * hi
        segments.append([[float(p1[0]), float(p1[1])], [float(p2[0]), float(p2[1])]])
        rest = rest[~mask]
        if len(rest) < min_inliers:
            break
    return segments


def manhattan_align(segments: list[list[list[float]]], tol_deg: float = 12.0) -> list[list[list[float]]]:
    """支配的な軸に対し±tol_deg以内の線分を0/90度に整列する"""
    if not segments:
        return segments
    # 支配角: 各線分の角度を0-90に畳んで最頻値
    angles = []
    for (x1, y1), (x2, y2) in segments:
        a = np.degrees(np.arctan2(y2 - y1, x2 - x1)) % 180
        angles.append(a % 90)
    base = float(np.median(angles))
    out: list[list[list[float]]] = []
    for (x1, y1), (x2, y2) in segments:
        a = np.degrees(np.arctan2(y2 - y1, x2 - x1)) % 180
        rel = (a - base) % 90
        rel = min(rel, 90 - rel)
        if rel <= tol_deg:
            # 水平か垂直に寄せる(座標系は base=0 前提の簡易整列)
            if abs(((a - base) % 180) - 90) < 45:  # 縦
                xm = (x1 + x2) / 2
                out.append([[xm, min(y1, y2)], [xm, max(y1, y2)]])
            else:  # 横
                ym = (y1 + y2) / 2
                out.append([[min(x1, x2), ym], [max(x1, x2), ym]])
        else:
            out.append([[x1, y1], [x2, y2]])
    return out


def merge_segments(segments: list[list[list[float]]], gap_mm: float = 400.0) -> list[list[list[float]]]:
    """同一直線上で近接・重複する線分を統合する(軸整列後の水平/垂直のみ対象)"""
    horiz = []
    vert = []
    other = []
    for seg in segments:
        (x1, y1), (x2, y2) = seg
        if abs(y1 - y2) < 1:
            horiz.append(seg)
        elif abs(x1 - x2) < 1:
            vert.append(seg)
        else:
            other.append(seg)

    def merge_axis(segs: list, axis: int) -> list:
        # axis=0: 水平(yが一定) / axis=1: 垂直(xが一定)
        out: list = []
        segs = sorted(segs, key=lambda s: s[0][1 - axis * 0] if False else s[0][1] if axis == 0 else s[0][0])
        used = [False] * len(segs)
        for i, s in enumerate(segs):
            if used[i]:
                continue
            const_i = s[0][1] if axis == 0 else s[0][0]
            lo = min(s[0][axis], s[1][axis]) if axis == 0 else min(s[0][1], s[1][1])
            hi = max(s[0][axis], s[1][axis]) if axis == 0 else max(s[0][1], s[1][1])
            if axis == 0:
                lo, hi = min(s[0][0], s[1][0]), max(s[0][0], s[1][0])
            else:
                lo, hi = min(s[0][1], s[1][1]), max(s[0][1], s[1][1])
            for j in range(i + 1, len(segs)):
                if used[j]:
                    continue
                t = segs[j]
                const_j = t[0][1] if axis == 0 else t[0][0]
                if abs(const_j - const_i) > gap_mm / 2:
                    continue
                tlo = min(t[0][0], t[1][0]) if axis == 0 else min(t[0][1], t[1][1])
                thi = max(t[0][0], t[1][0]) if axis == 0 else max(t[0][1], t[1][1])
                if tlo > hi + gap_mm or thi < lo - gap_mm:
                    continue
                lo, hi = min(lo, tlo), max(hi, thi)
                const_i = (const_i + const_j) / 2
                used[j] = True
            if axis == 0:
                out.append([[lo, const_i], [hi, const_i]])
            else:
                out.append([[const_i, lo], [const_i, hi]])
        return out

    return merge_axis(horiz, 0) + merge_axis(vert, 1) + other


def snap_corners(segments: list[list[list[float]]], tol_mm: float = 350.0) -> list[list[list[float]]]:
    """近接する線分同士の端点を交点にスナップして角を閉じる"""
    import numpy as np

    segs = [np.array(s, dtype=float) for s in segments]

    def line_params(s):
        d = s[1] - s[0]
        n = np.array([-d[1], d[0]])
        norm = np.hypot(n[0], n[1])
        if norm == 0:
            return None
        n = n / norm
        return n, float(n @ s[0])

    for i in range(len(segs)):
        for j in range(len(segs)):
            if i == j:
                continue
            pi = line_params(segs[i])
            pj = line_params(segs[j])
            if pi is None or pj is None:
                continue
            (n1, d1), (n2, d2) = pi, pj
            A = np.array([n1, n2])
            if abs(np.linalg.det(A)) < 0.2:  # ほぼ平行
                continue
            x = np.linalg.solve(A, np.array([d1, d2]))
            for ei in range(2):
                if np.hypot(*(segs[i][ei] - x)) < tol_mm:
                    for ej in range(2):
                        if np.hypot(*(segs[j][ej] - x)) < tol_mm:
                            segs[i][ei] = x
                            segs[j][ej] = x
    return [[[float(s[0][0]), float(s[0][1])], [float(s[1][0]), float(s[1][1])]] for s in segs]


def split_at_t_junctions(segments: list[list[list[float]]], tol_mm: float = 350.0) -> list[list[list[float]]]:
    """線分の端点が他の線分の中間に当たる(T字)場合、端点を足元に寄せ、相手を分割する"""
    import numpy as np

    segs = [np.array(s, dtype=float) for s in segments]
    cuts: list[list[float]] = [[] for _ in segs]  # 各線分の分割位置t(0..1)

    for i, s in enumerate(segs):
        for ei in range(2):
            p = s[ei]
            for j, t_seg in enumerate(segs):
                if i == j:
                    continue
                a, b = t_seg[0], t_seg[1]
                d = b - a
                L = np.hypot(d[0], d[1])
                if L < 1:
                    continue
                t = float(((p - a) @ d) / (L * L))
                if t < 0.08 or t > 0.92:  # 端付近はコーナースナップの領分
                    continue
                foot = a + d * t
                if np.hypot(*(p - foot)) < tol_mm:
                    segs[i][ei] = foot
                    cuts[j].append(t)
                    break

    out: list[list[list[float]]] = []
    for j, s in enumerate(segs):
        ts = sorted(set([0.0, 1.0] + [round(t, 4) for t in cuts[j]]))
        a, b = s[0], s[1]
        for k in range(len(ts) - 1):
            p1 = a + (b - a) * ts[k]
            p2 = a + (b - a) * ts[k + 1]
            if np.hypot(*(p2 - p1)) < 50:
                continue
            out.append([[float(p1[0]), float(p1[1])], [float(p2[0]), float(p2[1])]])
    return out
