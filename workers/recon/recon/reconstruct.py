"""Reconstructor インターフェースと実装。

- FixtureReconstructor: 合成点群(.npz)を返す(テスト・オフライン用)
- FeedForwardReconstructor: VGGT系モデルのスケルトン。モデル未取得なら明示エラー。
  採用候補とライセンスの調査表は docs/model-licenses.md(確認欄は人間が埋める)。
"""
from __future__ import annotations

from pathlib import Path
from typing import Protocol

import numpy as np


class Reconstructor(Protocol):
    def reconstruct(self, image_paths: list[str]) -> tuple[np.ndarray, list[np.ndarray]]:
        """画像パス列 → (点群 Nx3 [mm想定のスケール不定], カメラ姿勢のリスト)"""
        ...


class FixtureReconstructor:
    def __init__(self, npz_path: str | Path):
        self.npz_path = Path(npz_path)

    def reconstruct(self, image_paths: list[str]) -> tuple[np.ndarray, list[np.ndarray]]:
        data = np.load(self.npz_path)
        return data["points"].astype(np.float64), []


class FeedForwardReconstructor:
    """VGGT系 feed-forward 再構成のスケルトン。

    実行には GPU とモデル重みが必要。今夜はロードしない(§5-M4)。
    """

    def __init__(self, model_name: str = "vggt"):
        self.model_name = model_name
        try:
            import torch  # noqa: F401
        except ImportError as e:  # pragma: no cover
            raise RuntimeError(
                "torch がインストールされていません。FeedForwardReconstructor は "
                "GPU環境(Modal等)での実行を想定しています。ローカルでは FixtureReconstructor を使ってください。"
            ) from e
        raise RuntimeError(
            f"モデル '{model_name}' は未取得です。docs/model-licenses.md のライセンス確認後に "
            "ダウンロード・組み込みを行ってください(人間TODO)。"
        )
