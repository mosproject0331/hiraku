/**
 * 動画からコマを取り出す（ブラウザ内で完結。ffmpeg不要）。
 * iPhoneのmov/mp4はブラウザがそのままデコードできるので、
 * サーバーに大きな動画を送らずに済む。
 */
export interface ExtractedFrame {
  /** 表示用の blob URL */
  url: string;
  blob: Blob;
  timeSec: number;
}

export async function extractFrames(
  file: File,
  count = 12,
  maxEdge = 1600,
  onProgress?: (done: number, total: number) => void,
): Promise<ExtractedFrame[]> {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.preload = 'auto';
  video.muted = true;
  video.playsInline = true;
  video.src = url;

  try {
    await new Promise<void>((resolve, reject) => {
      const to = setTimeout(() => reject(new Error('動画を読み込めませんでした（形式が対応していない可能性があります）')), 20000);
      video.onloadedmetadata = () => {
        clearTimeout(to);
        resolve();
      };
      video.onerror = () => {
        clearTimeout(to);
        reject(new Error('動画を読み込めませんでした（形式が対応していない可能性があります）'));
      };
    });

    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
    if (!duration) throw new Error('動画の長さを取得できませんでした');

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) throw new Error('動画の解像度を取得できませんでした');
    const scale = Math.min(1, maxEdge / Math.max(vw, vh));
    const cw = Math.round(vw * scale);
    const ch = Math.round(vh * scale);

    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas を使えませんでした');

    const frames: ExtractedFrame[] = [];
    for (let i = 0; i < count; i++) {
      // 先頭と末尾は避ける（暗転・ブレが多い）
      const t = duration * ((i + 0.5) / count);
      await seek(video, t);
      ctx.drawImage(video, 0, 0, cw, ch);
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.86));
      if (blob) frames.push({ url: URL.createObjectURL(blob), blob, timeSec: t });
      onProgress?.(i + 1, count);
    }
    return frames;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function seek(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error('コマの取り出しに時間がかかりすぎました')), 15000);
    const done = () => {
      clearTimeout(to);
      video.removeEventListener('seeked', done);
      // デコード完了を1フレーム待つ
      requestAnimationFrame(() => resolve());
    };
    video.addEventListener('seeked', done);
    video.currentTime = Math.max(0, t);
  });
}

/**
 * 下絵として保存できる形（データURL）に変換する。
 * サーバーに送らないので、公開環境でも・オフラインでも同じように動く。
 * 端末の保存領域に収まるよう、長辺1400px / JPEG品質0.82 に落とす。
 */
export async function toStorableDataUrl(
  source: Blob | File,
  maxEdge = 1400,
  quality = 0.82,
): Promise<string> {
  const url = URL.createObjectURL(source);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('画像を開けませんでした'));
      i.src = url;
    });
    const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas を使えませんでした');
    ctx.drawImage(img, 0, 0, w, h);
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    // 端末の保存領域(おおむね5MB)を圧迫しすぎないよう上限を設ける
    if (dataUrl.length > 3_000_000) {
      return canvas.toDataURL('image/jpeg', 0.6);
    }
    return dataUrl;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function imageSize(src: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => reject(new Error('画像を開けませんでした'));
    img.src = src;
  });
}
