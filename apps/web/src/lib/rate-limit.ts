/**
 * ごく簡単な当たり判定。公開したときに、AIのAPIが際限なく叩かれるのを防ぐ。
 * インスタンスごとのメモリなので厳密ではないが、無いよりはるかにましという位置づけ。
 */
const hits = new Map<string, number[]>();

export interface LimitResult {
  ok: boolean;
  retryAfterSec: number;
}

export function rateLimit(key: string, max: number, windowSec: number): LimitResult {
  const now = Date.now();
  const from = now - windowSec * 1000;
  const arr = (hits.get(key) ?? []).filter((t) => t > from);
  if (arr.length >= max) {
    const oldest = arr[0] ?? now;
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((oldest + windowSec * 1000 - now) / 1000)) };
  }
  arr.push(now);
  hits.set(key, arr);
  // 古い鍵を掃除
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (!v.some((t) => t > from)) hits.delete(k);
  }
  return { ok: true, retryAfterSec: 0 };
}

export function clientKey(req: Request): string {
  const h = req.headers;
  return (
    h.get('x-nf-client-connection-ip') ??
    h.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    h.get('x-real-ip') ??
    'unknown'
  );
}
