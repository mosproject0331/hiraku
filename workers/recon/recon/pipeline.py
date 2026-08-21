"""点群→間取り下書きJSONの一気通貫"""
from __future__ import annotations

import numpy as np

from .export import segments_to_model
from .planes import find_floor_z, wall_band
from .scale import apply_scale
from .walls import extract_segments, manhattan_align, merge_segments, snap_corners, split_at_t_junctions


def pointcloud_to_model(points: np.ndarray, scale: float = 1.0, height_mm: float | None = None) -> dict:
    floor_z = find_floor_z(points)
    band = wall_band(points, floor_z)
    segs = extract_segments(band)
    segs = manhattan_align(segs)
    segs = merge_segments(segs)
    segs = snap_corners(segs)
    segs = split_at_t_junctions(segs)
    if scale != 1.0:
        segs = apply_scale(segs, scale)
    if height_mm is None:
        z = points[:, 2]
        height_mm = float(np.percentile(z, 99) - floor_z)
    return segments_to_model(segs, height_mm=height_mm)
