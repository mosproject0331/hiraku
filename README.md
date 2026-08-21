# HIRAKU(仮称)

空き家活用×場づくり支援AI。仕様は `REQUIREMENTS.md`(唯一の仕様書)。

## セットアップ

```bash
pnpm install
pnpm test        # 全パッケージのテスト
pnpm dev         # http://localhost:3000 (apps/web)
```

`LLM_MODE=mock`(既定)でオフライン動作。APIキー不要。

## デモ手順

- (P0) `pnpm --filter @hiraku/core test` — 幾何コアのテスト
