# HIRAKU(仮称)

空き家を活かして場をつくる人のための、現況把握・法規制翻訳・改修計画ツール。
仕様は `REQUIREMENTS.md`(唯一の仕様書)。診断・見積は参考情報であり、法的助言・設計・媒介ではありません。

## 起動(いちばん簡単)

Finder で `~/Developer/hiraku/run.command` を**ダブルクリック**。
初回だけセットアップが走り、その後ブラウザで http://localhost:3000 が開きます。
終了はターミナルウィンドウで Control + C。

## セットアップ(コマンド派)

```bash
pnpm install
pnpm test        # 全パッケージのテスト(vitest)
pnpm dev         # http://localhost:3000
```

Python側(再構成パイプライン):

```bash
cd workers/recon
python3 -m venv .venv && .venv/bin/pip install numpy pytest
.venv/bin/python -m pytest tests/ -q
```

`LLM_MODE=mock`(既定)でオフライン動作。APIキー不要。live実行は `ANTHROPIC_API_KEY` を設定し `LLM_MODE=live pnpm dev`。

## デモ手順(受け入れ基準 §13 対応)

1. **モードA**: トップ →「モードA」→ 用途「カフェ・飲食店」選択 → 条件+内見チェックリスト表示 → 印刷/PDF保存
2. **モードB**: トップ →「モードB」→ 11画面ウィザード(調整区域・地目=畑・延床250㎡・検査済証なし等の意地悪入力可) → 診断レポート(確認先マトリクス=窓口×質問文テンプレ)
3. **エディタ**: /editor →「サンプルを読み込む」→ 壁を1枚削除/描画 → 面積・畳数が追随。確度3色+耐力壁疑い表示+3Dプレビュー
4. **改修**: エディタ→「改修の相談へ」→ 要望を2回送信(mock) → 3案表示 → 各案にDIY/専門/許可の3区分レンジ+資格・構造フラグ+手順
5. **実測**: エディタで壁を選択(または計測ナビをクリック)→ 実測長(mm)を登録×2本 → 該当が緑に変わり面積再計算 →「現況調査報告書をつくる」
6. **recon**: `workers/recon/.venv/bin/python -m pytest workers/recon/tests/ -q` → green。
   `workers/recon/out/recon-draft.json` をエディタの「JSON読込」で取り込むと再構成下書き(2室+廊下)が開く
7. **プロジェクト**: /project → 名前を付けて保存 → 一覧から読込。診断後は確認事項ToDoとAI質問(mock)が使える

## 構成

pnpmモノレポ。`packages/core`(幾何) `rules`(法規25本) `estimate`(工事項目40+見積) `llm`(mock/live) `report`(印刷HTML) `regionpack`(地域パック) / `apps/web`(Next.js) / `workers/recon`(Python)。
進捗は `PROGRESS.md`、設計判断は `ASSUMPTIONS.md`、残タスクは `NEXT_STEPS.md`(人間TODOは[human]タグ)。
