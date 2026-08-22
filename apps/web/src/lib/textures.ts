import * as THREE from 'three';

/**
 * 素材の質感を手続きで生成する。
 * 外部の画像を持たないので、オフラインでも公開環境でも同じ見え方になる。
 * 生成した canvas から色・粗さ・凹凸の3枚をつくり、PBRとして扱う。
 */

const cache = new Map<string, MaterialMaps>();

export interface MaterialMaps {
  map: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
  /** 実寸1mあたりのタイル数 */
  repeatPerMeter: number;
}

function makeCanvas(size = 512): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  return [c, c.getContext('2d')!];
}

function toTexture(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function grayTexture(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/** 決定的な擬似乱数（同じ見た目を毎回再現するため） */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function noise(ctx: CanvasRenderingContext2D, size: number, amount: number, seed: number): void {
  const r = rng(seed);
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - 0.5) * amount;
    d[i] = Math.max(0, Math.min(255, d[i]! + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1]! + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2]! + n));
  }
  ctx.putImageData(img, 0, 0);
}

/** 木目（フローリング・板天井・梁） */
function wood(base: string, plankM: number, seed = 7): MaterialMaps {
  const S = 512;
  const [c, ctx] = makeCanvas(S);
  const [rc, rctx] = makeCanvas(S);
  const [bc, bctx] = makeCanvas(S);
  const r = rng(seed);

  ctx.fillStyle = base;
  ctx.fillRect(0, 0, S, S);
  rctx.fillStyle = '#9a9a9a';
  rctx.fillRect(0, 0, S, S);
  bctx.fillStyle = '#808080';
  bctx.fillRect(0, 0, S, S);

  const planks = 4;
  const ph = S / planks;
  for (let p = 0; p < planks; p++) {
    const y0 = p * ph;
    // 板ごとの色ムラ
    const shade = 0.86 + r() * 0.28;
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = shade > 1 ? '#ffffff' : '#000000';
    ctx.globalAlpha = Math.abs(1 - shade) * 0.9;
    ctx.fillRect(0, y0, S, ph);
    ctx.restore();

    // 木目
    for (let i = 0; i < 44; i++) {
      const y = y0 + r() * ph;
      ctx.strokeStyle = `rgba(58,34,14,${0.06 + r() * 0.15})`;
      ctx.lineWidth = 0.6 + r() * 2.4;
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= S; x += 24) {
        ctx.lineTo(x, y + Math.sin((x / S) * Math.PI * (1 + r() * 2)) * (1.5 + r() * 3));
      }
      ctx.stroke();
      bctx.strokeStyle = `rgba(0,0,0,${0.06 + r() * 0.08})`;
      bctx.lineWidth = ctx.lineWidth;
      bctx.stroke();
    }
    // 板の継ぎ目
    ctx.strokeStyle = 'rgba(0,0,0,.42)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, y0);
    ctx.lineTo(S, y0);
    ctx.stroke();
    bctx.strokeStyle = 'rgba(0,0,0,.75)';
    bctx.lineWidth = 3;
    bctx.stroke();
  }
  noise(ctx, S, 12, seed);
  noise(rctx, S, 26, seed + 1);

  const repeatPerMeter = 1 / (plankM * planks);
  return {
    map: toTexture(c),
    roughnessMap: grayTexture(rc),
    bumpMap: grayTexture(bc),
    repeatPerMeter,
  };
}

/** 畳（い草の織り目＋縁） */
function tatami(seed = 11): MaterialMaps {
  const S = 512;
  const [c, ctx] = makeCanvas(S);
  const [rc, rctx] = makeCanvas(S);
  const [bc, bctx] = makeCanvas(S);
  ctx.fillStyle = '#c9cd8e';
  ctx.fillRect(0, 0, S, S);
  rctx.fillStyle = '#d8d8d8';
  rctx.fillRect(0, 0, S, S);
  bctx.fillStyle = '#808080';
  bctx.fillRect(0, 0, S, S);

  const r = rng(seed);
  // い草の筋
  for (let y = 0; y < S; y += 3) {
    ctx.strokeStyle = `rgba(150,150,90,${0.16 + r() * 0.16})`;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(S, y + (r() - 0.5) * 1.4);
    ctx.stroke();
    bctx.strokeStyle = `rgba(0,0,0,${0.18 + r() * 0.12})`;
    bctx.lineWidth = 1.4;
    bctx.stroke();
  }
  // 縁（へり）
  ctx.fillStyle = '#3b3a34';
  ctx.fillRect(0, 0, S, 26);
  ctx.fillRect(0, S - 26, S, 26);
  bctx.fillStyle = '#6a6a6a';
  bctx.fillRect(0, 0, S, 26);
  bctx.fillRect(0, S - 26, S, 26);
  noise(ctx, S, 9, seed);

  const repeatPerMeter = 1 / 1.82; // 1畳 = 1820mm
  return { map: toTexture(c), roughnessMap: grayTexture(rc), bumpMap: grayTexture(bc), repeatPerMeter };
}

/** 漆喰・塗り壁（コテ跡） */
function plaster(base: string, seed = 3): MaterialMaps {
  const S = 512;
  const [c, ctx] = makeCanvas(S);
  const [rc, rctx] = makeCanvas(S);
  const [bc, bctx] = makeCanvas(S);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, S, S);
  rctx.fillStyle = '#e6e6e6';
  rctx.fillRect(0, 0, S, S);
  bctx.fillStyle = '#808080';
  bctx.fillRect(0, 0, S, S);
  const r = rng(seed);
  // コテのあと
  for (let i = 0; i < 120; i++) {
    const x = r() * S;
    const y = r() * S;
    const w = 40 + r() * 130;
    const h = 8 + r() * 26;
    const a = (r() - 0.5) * 0.9;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.fillStyle = `rgba(255,255,255,${0.03 + r() * 0.05})`;
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.fillStyle = `rgba(0,0,0,${0.015 + r() * 0.03})`;
    ctx.fillRect(-w / 2, h / 2, w, 2 + r() * 3);
    ctx.restore();
    bctx.save();
    bctx.translate(x, y);
    bctx.rotate(a);
    bctx.fillStyle = `rgba(255,255,255,${0.05 + r() * 0.07})`;
    bctx.fillRect(-w / 2, -h / 2, w, h);
    bctx.restore();
  }
  noise(ctx, S, 7, seed);
  const repeatPerMeter = 1 / 1.4;
  return { map: toTexture(c), roughnessMap: grayTexture(rc), bumpMap: grayTexture(bc), repeatPerMeter };
}

/** 土間（三和土・叩き） */
function earth(seed = 5): MaterialMaps {
  const S = 512;
  const [c, ctx] = makeCanvas(S);
  const [rc, rctx] = makeCanvas(S);
  const [bc, bctx] = makeCanvas(S);
  ctx.fillStyle = '#6d6055';
  ctx.fillRect(0, 0, S, S);
  rctx.fillStyle = '#c0c0c0';
  rctx.fillRect(0, 0, S, S);
  bctx.fillStyle = '#808080';
  bctx.fillRect(0, 0, S, S);
  const r = rng(seed);
  for (let i = 0; i < 2400; i++) {
    const x = r() * S;
    const y = r() * S;
    const rad = 0.6 + r() * 3.4;
    const light = r() > 0.5;
    ctx.fillStyle = light ? `rgba(214,198,176,${0.05 + r() * 0.18})` : `rgba(30,24,18,${0.04 + r() * 0.16})`;
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();
    bctx.fillStyle = light ? `rgba(255,255,255,${0.06})` : `rgba(0,0,0,${0.06})`;
    bctx.beginPath();
    bctx.arc(x, y, rad, 0, Math.PI * 2);
    bctx.fill();
  }
  noise(ctx, S, 10, seed);
  const repeatPerMeter = 1 / 1.1;
  return { map: toTexture(c), roughnessMap: grayTexture(rc), bumpMap: grayTexture(bc), repeatPerMeter };
}

/** 仕上げIDから質感を得る（生成結果は使い回す） */
export function materialMaps(finishId: string): MaterialMaps | null {
  if (typeof document === 'undefined') return null;
  const hit = cache.get(finishId);
  if (hit) return hit;
  let m: MaterialMaps;
  switch (finishId) {
    case 'flooring': m = wood('#b08654', 0.19, 7); break;
    case 'as_is_floor': m = wood('#9c8a72', 0.22, 13); break;
    case 'ceiling_board': m = wood('#a98e6b', 0.24, 17); break;
    case 'tatami_omote': m = tatami(); break;
    case 'doma': m = earth(); break;
    case 'shikkui_diy': m = plaster('#f3efe6', 3); break;
    case 'paint': m = plaster('#e8e4dc', 4); break;
    case 'cloth': m = plaster('#efeae2', 6); break;
    case 'ceiling_paint': m = plaster('#f2efe9', 8); break;
    case 'cushion_floor': m = plaster('#c8b89a', 9); break;
    default: m = plaster('#e8e4dc', 2); break;
  }
  cache.set(finishId, m);
  return m;
}
