"""既知長1本からスケール係数を算出・適用する"""
from __future__ import annotations


def scale_factor(measured_units: float, actual_mm: float) -> float:
    if measured_units <= 0 or actual_mm <= 0:
        raise ValueError("長さは正の値で指定してください")
    return actual_mm / measured_units


def apply_scale(segments: list[list[list[float]]], factor: float) -> list[list[list[float]]]:
    return [[[x * factor, y * factor] for x, y in seg] for seg in segments]
