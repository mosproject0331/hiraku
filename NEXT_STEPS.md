# 次にやること(優先順)

## いま残っている「人にしかできないこと」

1. [human] **写真を自前のものに差し替える** — `docs/CREDITS.md` の撮影リスト参照。
   現在はCC BY-SA 4.0の暫定素材で、ページ下部にクレジット表示が必要。
   差し替え先は `apps/web/public/img/`（同じファイル名で上書きするだけ）
2. [human] **単価の実データ投入** — `/app/prices` でテンプレCSVを取得 → 自社の積算単価を入れて取り込む。
   取り込んだ項目は自動で「実データ」扱いになり、見積の注記が変わる
3. [human] **ルール25本の文面レビュー** — `/app/rules` を印刷して赤入れ →
   `packages/rules/src/rules/all.ts` を修正
4. [human] **三田地域パックの実データ投入** — `packages/regionpack/src/packs/sanda/`
   （現在は「例:」のダミー。条例・補助金・窓口の実データが必要）
5. [human] **免責文の最終文言チェック** — `packages/report/src/html.ts` の `DISCLAIMER`
6. [human] `ANTHROPIC_API_KEY` を設定して `LLM_MODE=live` の実挙動確認（未設定でも全機能が動く）

## 環境の不具合（1コマンドで直る）

7. このMacの ffmpeg が壊れている（x265のリンク切れ）。
   Webアプリ側は影響を受けないが、`workers/recon` のフレーム抽出を使うなら:
   `brew reinstall ffmpeg`

## 将来フェーズ（設計は壊さないこと）

8. 動画からの**自動**間取り生成（現在は「下絵をなぞる」半自動）。
   モデル選定と商用利用可否の確認が前提 → `docs/model-licenses.md`
9. Modalへのデプロイと実動画での再構成テスト → `workers/recon/modal_app.py`
10. 国土数値情報(A29)による用途地域の自動判定 → `docs/opendata-integration.md`
11. 動画アップロード→ジョブキュー→結果通知
12. インターネット公開（Netlify等）。プロジェクトの保存先を Cloudflare D1 等へ。認証
13. ナレッジ層の拡充 — 現在11ヒント。27パターン全体への拡張と文面レビュー（`packages/knowledge`）
14. レーザー距離計(DISTO/GLM)の Web Bluetooth 実装（実機検証が必要）
