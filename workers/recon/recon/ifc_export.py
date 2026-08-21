"""core JSON → IFC4 最小構成(壁・スラブ)。

ifcopenshell はオプション依存。無い環境ではCLIが明示メッセージで終了し、
テストはスキップされる。使い方:
  python -m recon.ifc_export in.json out.ifc
"""
from __future__ import annotations

import json
import sys
from pathlib import Path


def have_ifcopenshell() -> bool:
    try:
        import ifcopenshell  # noqa: F401
        return True
    except ImportError:
        return False


def export_ifc(model_json_path: str | Path, out_path: str | Path) -> Path:
    if not have_ifcopenshell():
        raise RuntimeError(
            "ifcopenshell がインストールされていません: pip install ifcopenshell (optional)"
        )
    import ifcopenshell
    import ifcopenshell.api as api

    payload = json.loads(Path(model_json_path).read_text())
    model = payload["model"] if "model" in payload else payload
    level = model["levels"][0]
    nodes = {n["id"]: n for n in level["nodes"]}

    f = ifcopenshell.file(schema="IFC4")
    project = api.run("root.create_entity", f, ifc_class="IfcProject", name="HIRAKU recon")
    api.run("unit.assign_unit", f)
    ctx = api.run("context.add_context", f, context_type="Model")
    body = api.run(
        "context.add_context", f,
        context_type="Model", context_identifier="Body", target_view="MODEL_VIEW", parent=ctx,
    )
    site = api.run("root.create_entity", f, ifc_class="IfcSite", name="Site")
    building = api.run("root.create_entity", f, ifc_class="IfcBuilding", name="Building")
    storey = api.run("root.create_entity", f, ifc_class="IfcBuildingStorey", name=level.get("name", "1F"))
    api.run("aggregate.assign_object", f, relating_object=project, products=[site])
    api.run("aggregate.assign_object", f, relating_object=site, products=[building])
    api.run("aggregate.assign_object", f, relating_object=building, products=[storey])

    h = level.get("heightMm", 2400) / 1000.0
    for w in level["walls"]:
        a = nodes[w["a"]]
        b = nodes[w["b"]]
        wall = api.run("root.create_entity", f, ifc_class="IfcWall", name=w["id"])
        api.run("spatial.assign_container", f, relating_structure=storey, products=[wall])
        import math
        ax, ay = a["x"] / 1000.0, a["y"] / 1000.0
        bx, by = b["x"] / 1000.0, b["y"] / 1000.0
        length = math.hypot(bx - ax, by - ay)
        rep = api.run(
            "geometry.add_wall_representation", f,
            context=body, length=length, height=h, thickness=w.get("thickness", 120) / 1000.0,
        )
        api.run("geometry.assign_representation", f, product=wall, representation=rep)
        angle = math.atan2(by - ay, bx - ax)
        matrix = [
            [math.cos(angle), -math.sin(angle), 0.0, ax],
            [math.sin(angle), math.cos(angle), 0.0, ay],
            [0.0, 0.0, 1.0, 0.0],
            [0.0, 0.0, 0.0, 1.0],
        ]
        api.run("geometry.edit_object_placement", f, product=wall, matrix=matrix)

    out = Path(out_path)
    f.write(str(out))
    return out


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("usage: python -m recon.ifc_export in.json out.ifc")
        sys.exit(2)
    try:
        p = export_ifc(sys.argv[1], sys.argv[2])
        print("wrote", p)
    except RuntimeError as e:
        print(str(e))
        sys.exit(3)
