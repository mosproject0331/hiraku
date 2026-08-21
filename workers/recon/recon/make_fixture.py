"""2室+廊下の合成点群フィクスチャを生成する。

壁面・床面からノイズ付きでサンプリングし、正解の壁線分も同時に出力する。
テストの期待値として使う。単位はmm、z上向き、床z=0。
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np

# 全体 7280 x 4550 / 部屋A: x0..3640 / 部屋B: x3640..7280 / 廊下: y3640..4550(全幅)
GT_SEGMENTS: list[list[list[float]]] = [
    [[0, 0], [7280, 0]],
    [[7280, 0], [7280, 4550]],
    [[7280, 4550], [0, 4550]],
    [[0, 4550], [0, 0]],
    [[0, 3640], [7280, 3640]],   # 廊下の間仕切り
    [[3640, 0], [3640, 3640]],   # 部屋A/Bの間仕切り
]
HEIGHT = 2400.0


def sample_segment(seg: list[list[float]], rng: np.random.Generator, per_m2: float = 220.0) -> np.ndarray:
    (x1, y1), (x2, y2) = seg
    length = float(np.hypot(x2 - x1, y2 - y1))
    n = max(30, int(length / 1000 * HEIGHT / 1000 * per_m2))
    t = rng.uniform(0, 1, n)
    z = rng.uniform(0, HEIGHT, n)
    x = x1 + (x2 - x1) * t
    y = y1 + (y2 - y1) * t
    pts = np.stack([x, y, z], axis=1)
    return pts


def make_fixture(out_path: str | Path, seed: int = 7, noise_mm: float = 15.0) -> Path:
    rng = np.random.default_rng(seed)
    clouds = [sample_segment(seg, rng) for seg in GT_SEGMENTS]
    # 床
    nf = 4000
    floor = np.stack(
        [rng.uniform(0, 7280, nf), rng.uniform(0, 4550, nf), np.zeros(nf)], axis=1
    )
    clouds.append(floor)
    points = np.concatenate(clouds, axis=0)
    points = points + rng.normal(0, noise_mm, points.shape)
    out = Path(out_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(out, points=points.astype(np.float32))
    gt = out.with_suffix(".gt.json")
    gt.write_text(json.dumps({"segments": GT_SEGMENTS, "heightMm": HEIGHT}))
    return out


if __name__ == "__main__":
    p = make_fixture(Path(__file__).parent.parent / "fixtures" / "synthetic.npz")
    print("wrote", p)
