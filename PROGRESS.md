# 進捗ログ

## P0 基盤+コア — 完了
- できたこと: pnpmモノレポ scaffold / packages/core(型・detectRooms・面積畳数・snapToGrid・estimateModule・serialize) / サンプル間取りfixture(土間+廊下+和室3室) / vitest 13本 green
- やらないことにした事: corepack(Node25で非同梱)→ npm -g pnpm。package.jsonのpnpmフィールド(pnpm11が読まない)→ pnpm-workspace.yamlに設定。

## P1 エディタ — 完了
- できたこと: apps/web(Next.js16/Tailwind4/zustand) / SVG 2Dエディタ(描画・選択・ドラッグ・開口・削除・寸法・確度3色・undo/redo・部屋名編集) / three.js 3Dプレビュー(回転ズーム自作) / サンプル読込・JSON入出力・グリッド吸着・モジュール推定 / ブラウザ実機確認済(サンプル5部屋認識・壁削除で部屋結合と面積追随・3D同期)
- やらないことにした事: drei(OrbitControls用に重い)→カメラ操作を自作。Next15指定→16.3.2(現行安定版)を採用しASSUMPTIONSに記録。

## P2 診断 — 完了
- できたこと: rules25本+81テスト / zoning簡略マトリクス / 内見チェックリストデータ / report(診断・モードA、印刷CSS、XSSエスケープ、確認先マトリクス=窓口×質問文) / web: /wizard(モードA) /diagnose(モードB 11画面ウィザード+GSIジオコーダfallback付き) / ブラウザ確認済(モードA通し・モードB初画面)
- やらないことにした事: ダークモード対応(globals.cssの自動ダークで文字が消えた)→単一ライトテーマに固定。

## P3 改修+見積 — 完了
- できたこと: core(takeoff/validateOps/applyOps+8テスト) / estimate(工事項目マスタ40・見積エンジン・3区分レンジ・構造警告・7テスト) / llm(mock会話2往復→3案・live経路+zod検証+1リトライ→mockフォールバック・2テスト) / web(/plan: チャット→3案カード→内訳手順→間取りへ適用) / ブラウザ通し確認済(サンプル→相談→3案表示・参考値バッジ)
- やらないことにした事: zustand永続化(リロードで消えるのは既知。Repository実装はP6/NEXT_STEPSへ)。<a>遷移はstoreが消えるためnext/linkに統一。
