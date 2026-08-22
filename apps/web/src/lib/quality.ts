/**
 * 端末の力に合わせて描画の重さを決める。
 * 携帯で使うことが前提なので、既定は控えめに倒し、
 * 余力のある端末だけ影・環境遮蔽・被写界深度まで上げる。
 */

export type Tier = 'low' | 'mid' | 'high';

export interface QualityProfile {
  tier: Tier;
  /** devicePixelRatio の上限 */
  dprMax: number;
  /** 影を落とすか */
  shadows: boolean;
  shadowMap: number;
  /** 接触部が濃くなる柔らかい影（PCSS） */
  softShadows: boolean;
  /** 環境遮蔽 */
  ao: boolean;
  /** ガラスの屈折（重い） */
  transmission: boolean;
  /** MSAA のサンプル数。0 のときは SMAA を使う */
  msaa: number;
  bloom: boolean;
  /** 家具などの添景を置くか */
  entourage: boolean;
  /** 手続き素材の解像度 */
  texSize: number;
}

const PROFILES: Record<Tier, QualityProfile> = {
  low: {
    tier: 'low', dprMax: 1.5, shadows: true, shadowMap: 1024, softShadows: false,
    ao: false, transmission: false, msaa: 0, bloom: false, entourage: true, texSize: 512,
  },
  mid: {
    tier: 'mid', dprMax: 2, shadows: true, shadowMap: 2048, softShadows: true,
    ao: true, transmission: false, msaa: 0, bloom: true, entourage: true, texSize: 512,
  },
  high: {
    tier: 'high', dprMax: 2, shadows: true, shadowMap: 4096, softShadows: true,
    // 環境遮蔽は深度を読むため、MSAA とは併用しない。ふちは SMAA でならす
    ao: true, transmission: true, msaa: 0, bloom: true, entourage: true, texSize: 1024,
  },
};

interface Navigatorish {
  hardwareConcurrency?: number;
  deviceMemory?: number;
  userAgent?: string;
}

/** 端末を見て段階を決める。判断材料が無ければ mid に寄せる */
export function detectTier(): Tier {
  if (typeof navigator === 'undefined') return 'mid';
  const nav = navigator as unknown as Navigatorish;
  const cores = nav.hardwareConcurrency ?? 4;
  const mem = nav.deviceMemory ?? 4;
  const ua = nav.userAgent ?? '';
  const phone = /iPhone|iPod|Android.*Mobile/i.test(ua);
  const tablet = /iPad|Android(?!.*Mobile)/i.test(ua);

  // WebGL2 が無い端末は無条件に軽くする
  try {
    const c = document.createElement('canvas');
    if (!c.getContext('webgl2')) return 'low';
  } catch {
    return 'low';
  }

  if (phone) return cores >= 6 && mem >= 6 ? 'mid' : 'low';
  if (tablet) return cores >= 8 ? 'mid' : 'low';
  if (cores <= 4 || mem <= 4) return 'mid';
  return 'high';
}

export function profileFor(tier: Tier): QualityProfile {
  return PROFILES[tier];
}

/** 書き出し用。1コマだけなので、端末に関係なく上げ切る */
export function capturePreset(base: QualityProfile): QualityProfile {
  return {
    ...base,
    dprMax: Math.max(base.dprMax, 2),
    shadows: true,
    shadowMap: Math.max(base.shadowMap, 2048),
    softShadows: base.softShadows,
    ao: true,
    bloom: true,
  };
}

/** 省電力・動きを減らす設定を尊重する */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
