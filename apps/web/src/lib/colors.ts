import type { Confidence } from '@hiraku/core';

/** 確度3色(§2-3): estimated=グレー / hypothesis=黄 / measured=緑 */
export const CONF_COLOR: Record<Confidence, string> = {
  estimated: '#9ca3af',
  hypothesis: '#d97706',
  measured: '#16a34a',
};

export const CONF_LABEL: Record<Confidence, string> = {
  estimated: '推定',
  hypothesis: '仮説',
  measured: '実測',
};

export const OPENING_COLOR = {
  door: '#8b5cf6',
  window: '#0ea5e9',
  entrance: '#f43f5e',
  other: '#64748b',
} as const;

export const OPENING_LABEL = {
  door: '建具(ドア)',
  window: '窓',
  entrance: '玄関',
  other: 'その他',
} as const;
