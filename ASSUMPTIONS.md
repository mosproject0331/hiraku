# 判断記録

- [P0] 部屋認識は「最も時計回りの分岐を選ぶ」有向エッジ巡回で全面を抽出し、最大|面積|の面を外周として除外。理由: 単純で安定。代替: half-edge構造(過剰)。
- [P0] Level に拡張フィールド `nameHints?: {x,y,name}[]` を追加(仕様§4に無い)。理由: サンプル/recon出力が部屋名を運ぶ手段が仕様に無く、Roomは検出のたび再生成されるため位置ベースの命名が最も安定。
- [P0] Project.diagnosis は core では unknown 型で保持。理由: rules→core の一方向依存を守る(循環回避)。
- [P0] RenovationOp の語彙は core に置く(applyOps/validateOps が core 関数のため)。estimate は消費側。
- [P0] add_water_unit に routeNote(給排水経路メモ)を必須フィールドとして型に含めた(仕様§5-M6の「必須入力に」を型で強制)。
- [P0] fixtureの外周壁は structural='suspected'、内部間仕切りは 'unknown'(§2-4)。
- [P0] pnpm11: ビルドスクリプト許可は pnpm-workspace.yaml の onlyBuiltDependencies。verifyDepsBeforeRun: false(テスト実行毎のinstall検査が煩雑なため)。
- [P1] Next.js は仕様の15ではなく16.3.2(現行安定版)。App Router/挙動は同等。
- [P1] 3D回転ズームは three/addons の OrbitControls ではなく自作(球面座標)。drei/型定義のオーバーヘッド回避。
- [P1] ユーザーが描いた・動かした要素は confidence='measured'(§2-7「人の修正は measured として尊重」に従う)。
- [P1] 部屋名の永続化は nameHints(重心座標+名前)方式。部屋は検出のたび再生成されるため。
- [P1] DesiredUse は9リテラル(宿を住宅宿泊/簡易宿所に分割)。UI上は「宿」1カードでサブ選択にし、仕様の「8種」との見た目を保つ。
