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

## P4 実測 — 完了
- できたこと: core(solveConstraints逐次調整+確度更新・計測ナビ+5テスト) / report(現況調査報告書: 平面図SVG・実測一覧・劣化ピン・所見+2テスト) / web(実測入力パネル・計測ナビ・実測一覧削除・劣化ピンツール・/survey) / DistanceMeterAdapter(手入力+BTスケルトン) / ブラウザ確認済(壁長2本→緑→面積再計算→報告書表示)
- やらないことにした事: DeviceOrientation API連動(実機がない環境で検証不能)→傾きは手入力。厳密最小二乗→逐次調整(仕様が「厳密さより安定性」)。

## P5 recon+統合 — 完了
- できたこと: Python venv(numpy/pytest) / make_fixture(合成点群+GT) / planes(床z推定・2D線RANSAC自前実装) / walls(逐次抽出・マンハッタン整列・統合・角スナップ・T字分割) / scale / export(core JSON) / pipeline一気通貫 / frames(ffmpeg) / FeedForwardReconstructorスケルトン / ifc_export(optional・未導入はskip) / modal_app雛形 / pytest 5本green / recon出力JSONをcoreがdeserialize→3部屋認識(エディタのJSON読込で取込可) / docs/model-licenses.md(ライセンス未確認表) / docs/opendata-integration.md
- やらないことにした事: open3d(重依存)→numpy自前RANSAC。GPU実推論(§0-7)→fixture経路のみ。

## M7/M8 統合 — 完了
- できたこと: Repository IF(core)+LocalJsonRepository(.data/projects) / API(/api/projects, /api/projects/[id], /api/qa) / /project画面(保存・読込・タブ: 概要ToDo/診断/現況/改修3案・AI質問=reportQA mock) / 確認事項ToDo(診断のconfirmWith×questionsをチェックリスト化) / regionpack(schema+sandaプレースホルダ+診断レポートに地域情報セクション配線) / ブラウザ確認済(保存→一覧→表示)
- やらないことにした事: 認証(§11)。プロジェクト削除UI(APIのみ実装)。

## P6 磨き — 完了
- 全テスト: TS 125本 + pytest 5本(+ifcopenshell optional skip1) green。README/NEXT_STEPS整備。
