"""Modal デプロイ雛形(実行は人間TODO)。

手順:
 1. pip install modal && modal setup  (アカウント作成: https://modal.com)
 2. FeedForwardReconstructor の実装(モデル選定は docs/model-licenses.md のライセンス確認後)
 3. modal deploy workers/recon/modal_app.py
 4. web 側からジョブ投入(将来: ジョブキュー連携。NEXT_STEPS参照)

import modal

app = modal.App("hiraku-recon")
image = (
    modal.Image.debian_slim()
    .apt_install("ffmpeg")
    .pip_install("numpy", "torch", "pillow")
)

@app.function(gpu="T4", image=image, timeout=600)
def reconstruct_video(video_bytes: bytes) -> dict:
    # 1) 一時ファイルに保存 → frames.extract_frames
    # 2) FeedForwardReconstructor で点群化
    # 3) pipeline.pointcloud_to_model → JSONを返す
    raise NotImplementedError
"""
