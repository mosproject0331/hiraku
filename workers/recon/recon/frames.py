"""ffmpegでフレーム抽出(ffmpeg不在ならスキップ可能)"""
from __future__ import annotations

import shutil
import subprocess
from pathlib import Path


def ffmpeg_available() -> bool:
    return shutil.which("ffmpeg") is not None


def extract_frames(video_path: str | Path, out_dir: str | Path, fps: float = 2.0) -> list[Path]:
    if not ffmpeg_available():
        raise RuntimeError("ffmpeg が見つかりません。インストールするか、画像列を直接入力してください。")
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    cmd = [
        "ffmpeg", "-hide_banner", "-loglevel", "error",
        "-i", str(video_path), "-vf", f"fps={fps}",
        str(out / "frame_%05d.jpg"),
    ]
    subprocess.run(cmd, check=True)
    return sorted(out.glob("frame_*.jpg"))
