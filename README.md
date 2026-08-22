# HIRAKU(仮称)

空き家を活かして場をつくる人のための、現況把握・法規制翻訳・改修計画ツール。
仕様は `REQUIREMENTS.md`(唯一の仕様書)。診断・見積は参考情報であり、法的助言・設計・媒介ではありません。

## 起動(いちばん簡単)

Finder で `~/Developer/hiraku/run.command` を**ダブルクリック**するだけ。
本番ビルドで起動するので速く、ネットにつながっていなくても全機能が動きます。
初回だけセットアップとビルドが走ります(合計5分ほど)。終了は Control + C。

- 二重起動しても安全です(すでに動いていればブラウザを開くだけ)
- **同じWi-Fiのスマホからも見られます**。起動時に表示される
  `Network: http://192.168.x.x:3000` をスマホのブラウザで開いてください。
  内見チェックリストや劣化ピンを現地で使うときに便利です
- コードを直しながら使うときは `dev.command`(変更が即反映)

### コードを変えたあと
`run.command` はビルド済みのものを起動します。変更を反映するには:

```bash
pnpm --filter web build
```


## セットアップ(コマンド派)

```bash
pnpm install
pnpm test        # 全パッケージのテスト(vitest)
pnpm dev         # http://localhost:3000
```

Python側(再構成パイプライン・IFC書き出し):

```bash
cd workers/recon
python3 -m venv .venv && .venv/bin/pip install numpy pytest ifcopenshell
.venv/bin/python -m pytest tests/ -q

# 間取りJSON → IFC4
.venv/bin/python -m recon.ifc_export out/recon-draft.json out.ifc
```

`LLM_MODE=mock`(既定)でオフライン動作。APIキー不要。live実行は `ANTHROPIC_API_KEY` を設定し `LLM_MODE=live pnpm dev`。

## デモ手順(受け入れ基準 §13 対応)

1. **モードA**: トップ →「モードA」→ 用途「カフェ・飲食店」選択 → 条件+内見チェックリスト表示 → 印刷/PDF保存
2. **モードB**: トップ →「モードB」→ 11画面ウィザード(調整区域・地目=畑・延床250㎡・検査済証なし等の意地悪入力可) → 診断レポート(確認先マトリクス=窓口×質問文テンプレ)
3. **エディタ**: /editor →「サンプルを読み込む」→ 壁を1枚削除/描画 → 面積・畳数が追随。確度3色+耐力壁疑い表示+3Dプレビュー
4. **改修**: エディタ→「改修の相談へ」→ 要望を2回送信(mock) → 3案表示 → 各案にDIY/専門/許可の3区分レンジ+資格・構造フラグ+手順
5. **実測**: エディタで壁を選択(または計測ナビをクリック)→ 実測長(mm)を登録×2本 → 該当が緑に変わり面積再計算 →「現況調査報告書をつくる」
6. **下絵から作図**: /app/editor → サイドバーの「動画・写真から下絵」→ 室内を撮った動画（コマを選ぶ）か
   間取り図の写真を読み込む → 「実寸合わせ」で長さのわかる2点を指定 → 「壁を描く」でなぞる。
   ホイールで拡大縮小、Option+ドラッグで移動
7. **単価を自分のものに**: /app/prices → テンプレCSVを取得 → 単価を入れて取り込む →
   見積の「参考値・要検証」バッジが該当項目から消える
8. **ルールの確認**: /app/rules → 25本の文面・確認先・質問文を一覧、印刷可
9. **recon**: `workers/recon/.venv/bin/python -m pytest workers/recon/tests/ -q` → green。
   `workers/recon/out/recon-draft.json` をエディタの「JSON読込」で取り込むと再構成下書き(2室+廊下)が開く
10. **プロジェクト**: /project → 名前を付けて保存 → 一覧から読込。診断後は確認事項ToDoとAI質問(mock)が使える

## 構成

pnpmモノレポ。`packages/core`(幾何) `rules`(法規25本) `estimate`(工事項目40+見積) `llm`(mock/live) `report`(印刷HTML) `regionpack`(地域パック) / `apps/web`(Next.js) / `workers/recon`(Python)。
進捗は `PROGRESS.md`、設計判断は `ASSUMPTIONS.md`、残タスクは `NEXT_STEPS.md`(人間TODOは[human]タグ)。
