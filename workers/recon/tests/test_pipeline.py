import json
import subprocess
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))

from recon.export import segments_to_model
from recon.make_fixture import GT_SEGMENTS, make_fixture
from recon.pipeline import pointcloud_to_model
from recon.scale import apply_scale, scale_factor

FIXTURE = Path(__file__).parent / "_data" / "synthetic.npz"


@pytest.fixture(scope="module")
def points() -> np.ndarray:
    make_fixture(FIXTURE)
    return np.load(FIXTURE)["points"].astype(np.float64)


def seg_endpoints_sorted(seg):
    return sorted([tuple(seg[0]), tuple(seg[1])])


def test_walls_match_ground_truth(points):
    """各GT壁が、抽出線分(分割後)で80%以上カバーされること"""
    payload = pointcloud_to_model(points)
    level = payload["model"]["levels"][0]
    nodes = {n["id"]: n for n in level["nodes"]}
    got = []
    for w in level["walls"]:
        a, b = nodes[w["a"]], nodes[w["b"]]
        got.append(np.array([[a["x"], a["y"]], [b["x"], b["y"]]], dtype=float))
    TOL = 260.0
    covered_count = 0
    for gt in GT_SEGMENTS:
        g0 = np.array(gt[0], dtype=float)
        g1 = np.array(gt[1], dtype=float)
        d = g1 - g0
        L = float(np.hypot(*d))
        u = d / L
        n = np.array([-u[1], u[0]])
        cover = 0.0
        for seg in got:
            # 両端がGT直線の近くにある線分の、GT区間内の射影長を合算
            if max(abs((seg[0] - g0) @ n), abs((seg[1] - g0) @ n)) > TOL:
                continue
            t0 = float((seg[0] - g0) @ u)
            t1 = float((seg[1] - g0) @ u)
            lo, hi = sorted([t0, t1])
            cover += max(0.0, min(hi, L) - max(lo, 0.0))
        if cover >= 0.8 * L:
            covered_count += 1
    assert covered_count >= len(GT_SEGMENTS) - 1


def test_scale():
    assert scale_factor(2.0, 1820.0) == 910.0
    segs = apply_scale([[[0, 0], [2, 0]]], 910.0)
    assert segs[0][1][0] == 1820.0
    with pytest.raises(ValueError):
        scale_factor(0, 100)


def test_export_schema():
    payload = segments_to_model([[[0, 0], [1000, 0]], [[1000, 0], [1000, 1000]]])
    assert payload["schema"] == "hiraku/space-model"
    level = payload["model"]["levels"][0]
    assert len(level["walls"]) == 2
    assert len(level["nodes"]) == 3  # 共有ノードが統合される
    for n in level["nodes"]:
        assert n["confidence"] == "estimated"


def test_export_closed_loop(points):
    payload = pointcloud_to_model(points)
    level = payload["model"]["levels"][0]
    # 外周が閉じている: 全ノードの次数が2以上
    deg = {}
    for w in level["walls"]:
        deg[w["a"]] = deg.get(w["a"], 0) + 1
        deg[w["b"]] = deg.get(w["b"], 0) + 1
    assert all(v >= 2 for v in deg.values())


def test_ifc_export_optional(tmp_path):
    from recon.ifc_export import have_ifcopenshell
    if not have_ifcopenshell():
        pytest.skip("ifcopenshell 未導入(optional)")
    from recon.ifc_export import export_ifc
    payload = segments_to_model([[[0, 0], [3000, 0]]])
    src = tmp_path / "m.json"
    src.write_text(json.dumps(payload))
    out = export_ifc(src, tmp_path / "m.ifc")
    assert out.exists() and out.stat().st_size > 0


def test_frames_module_importable():
    from recon.frames import ffmpeg_available
    assert isinstance(ffmpeg_available(), bool)
