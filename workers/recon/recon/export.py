"""壁線分 → core の空間モデルJSON(schema: hiraku/space-model)"""
from __future__ import annotations

import json
from pathlib import Path

MERGE_TOL = 150.0


def _node_key(x: float, y: float, nodes: list[dict]) -> str:
    for n in nodes:
        if abs(n["x"] - x) <= MERGE_TOL and abs(n["y"] - y) <= MERGE_TOL:
            return n["id"]
    nid = f"n{len(nodes) + 1}"
    nodes.append({"id": nid, "x": round(x), "y": round(y), "confidence": "estimated"})
    return nid


def segments_to_model(
    segments: list[list[list[float]]],
    height_mm: float = 2400.0,
    model_id: str = "recon-draft",
) -> dict:
    nodes: list[dict] = []
    walls: list[dict] = []
    for seg in segments:
        (x1, y1), (x2, y2) = seg
        a = _node_key(x1, y1, nodes)
        b = _node_key(x2, y2, nodes)
        if a == b:
            continue
        walls.append(
            {
                "id": f"w{len(walls) + 1}",
                "a": a,
                "b": b,
                "thickness": 120,
                "confidence": "estimated",
                "structural": "unknown",
            }
        )
    level = {
        "id": "L1",
        "name": "1階",
        "heightMm": round(height_mm),
        "walls": walls,
        "nodes": nodes,
        "openings": [],
        "rooms": [],
    }
    model = {
        "id": model_id,
        "levels": [level],
        "moduleMm": 910,
        "scaleFactor": 1,
        "version": 1,
    }
    return {"schema": "hiraku/space-model", "version": 1, "model": model}


def write_model(payload: dict, out_path: str | Path) -> Path:
    out = Path(out_path)
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=2))
    return out
