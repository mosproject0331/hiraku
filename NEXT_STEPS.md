# 次にやること(優先順)

1. [human] **写真を自前のものに差し替える**（`docs/CREDITS.md` の撮影リスト参照）。現在はCC BY-SA 4.0の暫定素材で、クレジット表示が必要
2. [human] 動画アップロード→間取り生成のWeb経路。モデル選定とライセンス確認が前提（ランディングの主張と実装が唯一ずれている箇所）
3. [human] ANTHROPIC_API_KEY 設定 → `LLM_MODE=live pnpm dev` で hearing/explainer の実挙動確認
2. [human] docs/model-licenses.md のライセンス確認欄を埋める(商用利用可否の確定は必須)
3. [human] Modalアカウント作成 → workers/recon/modal_app.py のデプロイと実動画での再構成テスト
4. [human] 単価DBへの実データ投入(自前積算シート+物価資料) → work-items.ts を verified:true 化
5. [human] ルール25本の内容レビュー(実務目線での文言修正) — packages/rules/src/rules/all.ts
6. [human] 三田地域パックの実データ投入 — packages/regionpack/src/packs/sanda/
7. [human] 国土数値情報(A29)取得と GeoJsonZoningProvider 実装判断 — docs/opendata-integration.md
8. [human] レーザー距離計(DISTO/GLM)実機でのWeb Bluetooth検証(Android Chrome) — apps/web/src/lib/distance-meter.ts
9. [human] 免責文の最終文言チェック — packages/report/src/html.ts
10. 動画アップロード→Modal→結果通知のジョブキュー連携(web側)
11. プロジェクトの Cloudflare D1 移行(Repository差し替え)・認証
13. 部屋名インライン編集のUX改善、undo対象への実測の統合
13. ナレッジ層の拡充 — 現在11ヒント。27パターン全体への拡張と、建石さんによる文面レビュー(packages/knowledge)
14. [human] ナレッジ層の問いの文面レビュー(パターンの意図と合っているか)
