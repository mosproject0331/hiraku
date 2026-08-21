# HIRAKU(仮称) 開発要件書 — Claude Code オーバーナイトセッション v1.0

> 空き家活用×場づくり支援AI。動画・写真から3Dと図面を起こし、現地実測で作り込み、法規制を翻訳し、改修計画と概算見積まで伴走するツール。 作成: 2026-08-22 / 想定実行: Claude Code 一晩の自律セッション

---

## §0. Claude Codeへの実行指示(最初に読み、常に従う)

1. **このドキュメントが唯一の仕様書。** §12の実行計画に従い、P0から順に実装する。  
2. **止まらない。** 仕様の不明点・技術選定の迷いは `ASSUMPTIONS.md` に「判断・理由・代替案」を1〜3行で記録し、合理的なデフォルトを選んで進む。ユーザーへの質問で停止しない。  
3. **常に動く状態を保つ。** 意味のある単位でこまめに git commit。各フェーズ完了時に `PROGRESS.md` を更新し、`pnpm dev` と全テストが通る状態を維持する。  
4. **トークン・コンテキスト節約規律(重要):**  
   - 生成済みファイルの全文再読を避け、必要な箇所だけ読む。  
   - 同じ調査・同じ失敗を繰り返さない。失敗した方針は `PROGRESS.md` の「やらないことにした事」欄に記録する。  
   - 迷ったら探索より生成。動くものを書き、テストで検証する。  
   - 依存パッケージの追加は必要最小限。重いネイティブ依存は避ける。  
   - **セッションがいつ中断されても、`PROGRESS.md` と `NEXT_STEPS.md` だけを読めば完全に再開できる状態を常に維持する。** これが最優先の保険。  
5. **品質規律:** `packages/core` `packages/rules` `packages/estimate` と `workers/recon` はテスト必須。UI は手動確認レベルでよい。型は strict。  
6. トークン残量・時間に不安が出たら、残フェーズを縮小してでも **§13 受け入れ基準の統合デモを完成させることを優先** する。  
7. 外部ネットワークに依存しない。すべての外部API・LLM呼び出しは mock フォールバックを持ち、`LLM_MODE=mock` かつオフラインで全機能が一周できること。

---

## §1. プロダクト概要

### 1.1 解く問題

空き家を活かして場(カフェ、宿、シェアハウス、アトリエ、コミュニティスペース等)をつくりたい人 — 主に移住者・起業家 — は、物件に出会っても次の3つが分からず止まる。

1. **法的にできるのか**(用途地域、市街化調整区域、用途変更、許認可、農地…)  
2. **いくらかかるのか**(改修費の相場が不透明)  
3. **次に何を、どこに確認すればいいのか**(質問の仕方すら分からない)

既存ツールは間取り作成か物件検索に偏り、「この物件で、この用途が、成立するか」を翻訳してくれるものが無い。空き家には図面が残っていないことが多く、現況把握自体が高コストという問題もある。

### 1.2 一次ユーザーとユーザーストーリー

一次ユーザー: 空き家を活用したい人(移住者・起業家)。副次: 支援者(エリアマネジメント会社・自治体)。

- US1: 活用希望者として、やりたい用途を選ぶと「探すべき物件の条件」と「内見チェックリスト」が欲しい。物件探しで失敗したくないから。(モードA)  
- US2: 候補物件を持つ者として、住所と物件情報を入れると「この用途が法的に成立しそうか・根拠・どこに何を確認すべきか」を知りたい。行政窓口で的確に質問したいから。(モードB)  
- US3: 候補物件を持つ者として、スマホ動画から間取りの下書きと簡易3Dが欲しい。図面が無いから。  
- US4: 現地調査する者として、実測値を入れるほどモデルが正確になり、どこが推定でどこが確定かが色で分かってほしい。信頼できる数字で計画したいから。  
- US5: 計画する者として、改修の要望を対話で伝えると複数案・必要工事・材料費ベースの概算・DIY可否と資格要否・手順が欲しい。予算と自分でやれる範囲を判断したいから。

### 1.3 ゴール(このプロダクトが目指す成果)

- 物件候補に対する「可否・費用・次の一手」の初期把握を、数週間→1時間に短縮する。  
- 行政・専門家への相談の質を上げる(質問文テンプレまで渡す)。  
- 実測を重ねるほど賢くなる現況モデルを、専門ソフトなしのブラウザで持てるようにする。

### 1.4 非ゴール(プロダクトとして恒久的にやらないこと)

- 法的助言・建築士業務(設計/調査の代替)・宅建業(媒介)は行わない。あくまで情報整理と翻訳。  
- 耐力壁・構造安全の断定はしない。  
- 完全自動のscan-to-BIMは狙わない。「自動8割+人の修正2割」を良い体験にする。

---

## §2. 設計原則(絶対規範 — 全実装がこれに従う)

1. **判定は決定的に、言語化はLLMに。** 法規制判定・数量計算・見積はルールエンジンとデータで決定的に行う。LLMの役割は翻訳・解説・対話・提案の言語化のみ。  
2. **断定しない。** 出力は常に「可能性(◎/○/△/×/不明)+根拠+確認先+質問文テンプレ」。断定表現(「できます」「不要です」)は使わない。  
3. **確度の可視化。** すべての寸法・形状・金額は確度属性を持つ: `estimated`(AI/初期推定=グレー) / `hypothesis`(グリッドスナップ等の仮説=黄) / `measured`(実測・確定=緑)。UIは常にこの3色で状態を示す。  
4. **構造安全の一線。** 壁の撤去・開口を伴う操作には必ず構造確認フラグを付け、「構造の可否は現地で専門家確認が必要」を表示する。外周壁・モジュール芯上の壁は `suspected`(耐力壁疑い)を初期値とする。  
5. **数値のハルシネーション禁止。** LLMは価格・法令の条番号・面積閾値などの数値を新規生成しない。DB・ルールに無い値は「不明」と表示する。シードした単価はすべて `verified: false` の参考レンジとして扱い、UI上で「参考値・要検証」バッジを表示する。  
6. **汎用コア+地域パック。** 国の法律・全国共通ロジックはコアに、条例・補助金・窓口・ローカル知見は地域パック(差し込みデータ)に分離する。  
7. **8割自動+2割修正。** 自動化の失敗を前提に、人の修正が速く気持ちいいUIを作る。修正結果は確度 `measured` として尊重する。

---

## §3. アーキテクチャ

### 3.1 モノレポ構成(pnpm workspaces)

hiraku/

  apps/web/            Next.js 15 (App Router, TypeScript strict, Tailwind)

  packages/core/       幾何カーネル: モデル型・部屋認識・面積/数量・尺グリッド・制約ソルバー

  packages/rules/      法規制ルールエンジン \+ ルールデータ(§6)

  packages/estimate/   見積エンジン \+ 工事項目マスタ(§7) \+ 改修Op検証

  packages/llm/        LLMクライアント(Anthropic API) \+ プロンプト \+ mock

  packages/report/     診断/現況/計画レポートの生成(HTML, 印刷CSS)

  packages/regionpack/ 地域パックschema \+ packs/sanda/(プレースホルダ)

  workers/recon/       Python: 動画→3D→間取り下書きパイプライン \+ IFC出力

  docs/                ADR, model-licenses.md, opendata-integration.md

  REQUIREMENTS.md  PROGRESS.md  ASSUMPTIONS.md  NEXT\_STEPS.md  README.md

### 3.2 技術スタック

- Node 20+ / pnpm / TypeScript strict / vitest。Python 3.11+ / pytest(recon)。  
- Web: Next.js 15 App Router。状態は zustand。スタイルは Tailwind。  
- **2D間取りエディタは SVG ベース**(描画・当たり判定・印刷が単純で確実)。**3Dプレビューは three.js(react-three-fiber)** で壁を押し出し表示。エディタをWebGLで作らないこと。  
- 永続化: `Repository` インターフェースを切り、実装は当面ローカルJSONファイル(`.data/projects/*.json`、Next.js Route Handler経由)。将来 Cloudflare D1 に差し替え可能な形にする。認証なし。  
- LLM: Anthropic Messages API。既定モデルは env `ANTHROPIC_MODEL`(デフォルト `claude-sonnet-4-6`)。`LLM_MODE=mock` で決定的なモック応答。APIキーが無くても全画面が動くこと。  
- ジオコーディング: 国土地理院 AddressSearch API(キー不要)を第一候補とし、必ず手入力フォールバックを持つ。動作しなければ即フォールバックし `ASSUMPTIONS.md` に記録。  
- IFC: `workers/recon` 内の Python ユーティリティ(ifcopenshell)で JSON→IFC 変換 CLI を提供(web側はJSON/glTFのみ扱う)。

### 3.3 データフロー(全体像)

\[モードA\] 用途選択 ──────────────→ rules(逆引き) → 条件+内見チェックリスト

\[モードB\] 住所+物件入力 → geocode → rules(診断) → 診断レポート

\[空間\]   動画 → recon(Python) → 間取り下書きJSON ┐

         手描き/サンプル ─────────────────────────┼→ core モデル → SVGエディタ/3D

         実測値入力 → 制約ソルバー → 確度更新 ──┘

\[計画\]   ヒアリング(LLM) → RenovationOp\[\] → estimate → 3案+見積+手順+資格

\[出力\]   report: 診断/現況調査/改修計画 → 印刷・保存

---

## §4. ドメインモデル(M0) — `packages/core`

単位は内部すべて **mm の整数**。表示はm(小数2桁)。畳数表示は面積÷1.62㎡(参考値表記)。

type Confidence \= 'estimated' | 'hypothesis' | 'measured';

interface Node { id: string; x: number; y: number; confidence: Confidence }

interface Wall {

  id: string; a: string; b: string;          // Node id

  thickness: number;                          // default 120

  confidence: Confidence;

  structural: 'unknown' | 'suspected' | 'cleared\_by\_expert'; // §2-4

}

interface Opening {

  id: string; wallId: string; offset: number; width: number;

  height: number; sillHeight: number;

  kind: 'door' | 'window' | 'entrance' | 'other';

  confidence: Confidence;

}

interface Room { id: string; name: string; wallLoop: string\[\]; areaM2: number; tatami: number }

interface Level { id: string; name: string; heightMm: number; walls: Wall\[\]; nodes: Node\[\]; openings: Opening\[\]; rooms: Room\[\] }

interface SpaceModel { id: string; levels: Level\[\]; moduleMm: number /\* 既定910 \*/; scaleFactor: number; version: number }

interface Measurement {

  id: string; type: 'wallLength' | 'diagonal' | 'ceilingHeight' | 'openingWidth' | 'tilt';

  targetIds: string\[\]; valueMm: number; note?: string; createdAt: string;

}

interface DamagePin {

  id: string; levelId: string; x: number; y: number;

  category: '雨漏り' | '腐朽' | '蟻害' | '傾き' | '設備' | 'その他';

  photoRef?: string; memo: string;

}

interface Property { address?: string; lat?: number; lng?: number; landCategory?: string; builtYear?: number; notes: string }

interface Project {

  id: string; name: string; property: Property;

  model?: SpaceModel; measurements: Measurement\[\]; damagePins: DamagePin\[\];

  diagnosis?: DiagnosisInput & { report?: DiagnosisReport };

  plans: RenovationPlan\[\]; regionPackId?: string;

  createdAt: string; updatedAt: string;

}

core が提供する純関数(すべてユニットテスト対象):

- `detectRooms(level)`: 壁グラフから閉ループを抽出し部屋を認識、面積・畳数を計算。  
- `snapToGrid(model, moduleMm, toleranceMm)`: ノードをモジュール格子へスナップ。`measured` のノード・壁は動かさない。スナップされたものは `hypothesis` に昇格。  
- `estimateModule(model)`: 壁長の分布から候補 \[910, 955\] のどちらが整合的かをスコアリング(残差最小)。判定不能なら910。  
- `solveConstraints(model, measurements)`: 実測値をハード制約、推定値をソフト制約とした反復最小二乗(単純なガウス・ニュートン or 逐次調整で可。厳密さより安定性)。適用後、対象の確度を `measured` に更新。  
- `takeoff(model, ops?)`: 数量拾い — 部屋別床面積、壁面積(開口控除)、開口数、撤去対象の壁面積・長さ。  
- `validateOps(model, ops)`: §5-M6 の改修Opの適用可否チェック(存在しない要素参照、構造フラグ壁の警告など)。  
- `applyOps(model, ops)`: Op列を適用した新モデルを返す(イミュータブル)。  
- `serialize / deserialize`: バージョン付きJSON。

---

## §5. モジュール仕様

### M1: モードA — 要件逆引きウィザード(`apps/web` \+ `packages/rules`)

- 入力: やりたい用途(カフェ/宿(住宅宿泊 or 簡易宿所)/シェアハウス/アトリエ・工房/物販/コワーキング/私設図書館/住まい+α の8種) \+ 規模感(小/中/大) \+ 想定地域(任意テキスト)。  
- 出力(1画面+印刷可):  
  1. **物件に求める条件チェックリスト**: §6のルールを逆引きし「この用途なら、用途地域は◯◯系が望ましい / 接道 / 検査済証の有無を必ず確認 / 200㎡以下だと手続きが軽い」等を平易文で列挙。  
  2. **内見チェックリスト**: 用途共通(雨漏り跡・傾き・床下・シロアリ・給排水・電気容量・搬入経路)+用途別(厨房区画スペース、客導線、駐車場…)。データは `packages/rules/src/data/viewing-checklist.ts` に定義。  
  3. **探し方ガイド**: 空き家バンク・自治体窓口・地域の不動産会社という一般的経路の説明(静的文)。  
- 実装はルールデータ駆動。ハードコードの長文をコンポーネントに書かない。

### M2: モードB — 法規制診断ナビ(`packages/rules`)

**入力ウィザード**(1問1画面、すべて「わからない」選択可):

interface DiagnosisInput {

  address?: string;                    // → geocode(任意)

  youtoChiiki: YoutoChiiki | 'unknown';      // 13用途地域 \+ 指定なし

  kuikiKubun: 'shigaika' | 'chosei' | 'hisenbiki' | 'kuikigai' | 'unknown';

  bokaChiiki: 'boka' | 'junboka' | 'none' | 'unknown';

  setsudo: { roadWidthM?: number; frontageM?: number; flag: 'ok' | 'hatazao' | 'none' | 'unknown' };

  floorAreaM2?: number; floors?: number; builtYear?: number;

  kensazumi: 'yes' | 'no' | 'unknown';

  currentUse: 'jutaku' | 'tenpo' | 'other' | 'unknown';

  desiredUse: DesiredUse;              // M1と同じ8種

  landCategory: 'takuchi' | 'ta' | 'hatake' | 'other' | 'unknown'; // 地目

  haisui: 'gesui' | 'jokaso' | 'kumitori' | 'unknown';

}

- 用途地域が unknown の場合: 「調べ方ガイド」(自治体の都市計画情報サイト・都市計画課への電話の仕方)を表示し、後から入力できる導線を出す。**自動判定は `ZoningProvider` インターフェースだけ定義**し、実装は `ManualZoningProvider`(常にunknown)のみ。オープンデータ連携は `docs/opendata-integration.md` に設計メモを書き人間TODOへ。  
- ルールエンジン: 各ルールは純データ+純関数。

interface Rule {

  id: string; title: string; category: RuleCategory;

  appliesTo(input: DiagnosisInput): boolean;

  evaluate(input: DiagnosisInput): {

    verdict: 'ok' | 'conditional' | 'hard' | 'ng' | 'unknown';

    summary: string;               // 平易な一文(断定語禁止)

    detail: string;                // 根拠の考え方(法令名は名称レベル。条番号は §6 に記載があるもののみ)

    confirmWith: Array\<'都市計画課' | '建築指導課' | '保健所' | '消防署(予防課)' | '農業委員会' | '上下水道' | '文化財担当' | '建築士'\>;

    questions: string\[\];           // 窓口でそのまま使える質問文テンプレ 1〜2本

  };

}

- **診断レポート**(`packages/report`): ①総合サマリ(◎○△×不明の件数と読み方) ②判定カード一覧 ③不明点リスト(入力がunknownだったもの) ④**確認先マトリクス**(窓口×質問文テンプレを窓口ごとに束ねる。これがキラー機能) ⑤次のアクション3つ ⑥固定免責(§10)。印刷CSS必須。

### M3: 空間コア+エディタ(`packages/core` \+ `apps/web`)

- **SVG 2Dエディタ**: 壁の描画(クリック2点)、ノード/壁の選択・ドラッグ、開口の配置(壁上クリック→種別選択)、削除、寸法表示(壁長)、部屋名の編集、グリッド表示(モジュール格子)、確度3色の描き分け(§2-3)、undo/redo(zustandで単純に)。  
- **3Dプレビュー**: 同一モデルを壁厚・階高で押し出し表示、開口はくり抜き省略可(矩形の色分けで可)。回転・ズームのみ。  
- サンプル間取り: `packages/core/fixtures/sample-minka.json` として6〜8畳×3室+土間+廊下程度の平屋を定義し、「サンプルを読み込む」ボタンで即編集体験できること。  
- 面積・畳数は編集に追随してリアルタイム更新。

### M4: 再構成パイプライン(`workers/recon`, Python)

目的: 動画→フレーム→3D点群→平面→壁線分→間取り下書きJSON(confidence: 'estimated')。**今夜はGPU実行しない。** fixtureで全段をテスト可能にする。

- `frames.py`: ffmpegでフレーム抽出(ffmpeg不在ならスキップ可能な設計)。  
- `reconstruct.py`: `Reconstructor` インターフェース(入力: 画像パス列 → 出力: pointmap Nx3 \+ カメラ姿勢)。実装は2つ:  
  - `FixtureReconstructor`: `make_fixture.py` が合成する点群(.npz)を返す。  
  - `FeedForwardReconstructor`: VGGT系モデルのロード・推論のスケルトン(importはtry内、モデル未取得なら明示エラー)。採用候補・ライセンス調査表を `docs/model-licenses.md` に作る(VGGT / VGGT-Ω / π³ / Depth Anything 3 / NVIDIA公開のVGGT系。**ライセンスは未確認として表を作り、確認欄を空けておく。勝手に「商用可」と書かない**)。  
- `make_fixture.py`: 2室+廊下の合成点群をノイズ付きで生成(壁面・床面からのサンプリング)。正解の壁線分も同時に出力し、テストの期待値にする。  
- `planes.py`: 床=最大の水平面、壁=鉛直面クラスタ。RANSAC平面フィッティングは numpy で自前実装(open3d等の重依存を避ける)。  
- `walls.py`: 壁平面を床に射影→2D線分化→近接統合→(オプション)マンハッタン整列。  
- `scale.py`: 既知長1本(ユーザー実測)からスケール係数を算出し適用。  
- `export.py`: coreのJSONスキーマに合致する間取り下書きを出力。  
- `ifc_export.py`: core JSON → IFC4(ifcopenshellで壁・開口・スラブ最小構成)。CLI: `python -m recon.ifc_export in.json out.ifc`。ifcopenshellの導入が重い場合はoptional dependencyにし、無い環境ではスキップされるテストにする。  
- `modal_app.py`: Modalへのデプロイ雛形(コメントで手順)。実行は人間TODO。  
- pytest: fixture→抽出壁が正解と許容誤差内で一致すること、スケール適用、export整合。  
- webとの接続: 今夜は「reconの出力JSONをエディタにインポートするボタン」まで(ファイル選択)。ジョブキュー連携はNEXT\_STEPSへ。

### M5: 実測ワークフロー(`apps/web` \+ `packages/core`)

- 実測入力パネル: 対象(壁/対角/天井高/開口)を図上で選択→数値入力(mm/尺切替)→`solveConstraints` 再計算→確度色が緑に変わる。  
- **計測ナビ**: 「次に測ると効く場所」を提案。ヒューリスティクスで可: 未計測の壁を (長さ × 接続次数) 降順に3件提示+「部屋の対角を1本」推奨。根拠を1行で表示。  
- 傾き記録: DeviceOrientation APIで端末傾斜を取得し、選択した壁/床にtilt Measurementとして保存(非対応環境は手入力)。  
- レーザー距離計: `DistanceMeterAdapter` インターフェース \+ `ManualAdapter`(手入力)のみ実装。Web Bluetooth実装(Leica DISTO / Bosch GLM)はアダプタのスケルトンとTODOコメント(プロトコルは実機検証が必要な旨を明記)。iOS SafariはWeb Bluetooth非対応のため手入力が常に主経路。  
- 劣化ピン: 図上タップ→カテゴリ+メモ+写真参照(ファイル添付、ローカル保存)。  
- **現況調査報告書**(`packages/report`): 平面図SVG+実測一覧(確度別)+劣化ピン一覧+所見欄(自由記述)を1つのHTMLに。印刷CSS。

### M6: 改修エンジン(`packages/estimate` \+ `packages/llm`)

- 改修Op(LLMが発行し、コードが検証・適用する語彙):

type RenovationOp \=

  | { op: 'remove\_partition'; wallId: string }

  | { op: 'add\_partition'; a: XY; b: XY }

  | { op: 'add\_opening' | 'close\_opening'; ...}

  | { op: 'change\_floor' | 'change\_wall\_finish' | 'change\_ceiling'; roomId: string; finishId: string }

  | { op: 'add\_water\_unit'; roomId: string; unit: 'kitchen' | 'toilet' | 'bath' | 'sink' }

  | { op: 'insulate'; target: 'floor' | 'ceiling' | 'window\_inner'; roomId?: string }

  | { op: 'electrical'; work: 'add\_outlet' | 'add\_circuit' | 'lighting\_diy'; count: number; roomId?: string };

- 検証: 存在チェック / `remove_partition` は対象壁の `structural` を見て、`suspected` なら **警告付き承認フロー**(適用はできるが見積・レポートに「構造確認要」が必ず載る)。水回り追加は給排水経路メモを必須入力に。  
- 提案生成: ヒアリング(チャット2〜5往復) → LLMが「最小案 / 標準案 / 攻め案」の3案を、各案 \= Op列 \+ 狙いの一文、としてJSONで発行(tool use / 構造化出力。スキーマ検証、失敗時1リトライ→フォールバック定型案)。mockモードでは固定の3案を返す。  
- 見積: `takeoff` の数量 × §7マスタの単価レンジ → 案ごとに (a) DIY材料費レンジ (b) 有資格・専門工事(材料費のみ参考表示+「施工費は要見積」) (c) 許可・届出関連(金額なし、フラグのみ) の3区分で表示。**総額の一本値は出さない。常にレンジ。**  
- 手順・資格: 各工事項目の `steps` と `diyClass` / `requiredLicense` を案の詳細に展開。

### M7: レポート&伴走(`apps/web` \+ `packages/report` \+ `packages/llm`)

- プロジェクト画面: 診断レポート / 空間モデル / 改修3案 / 現況報告書をタブで統合。  
- AI質問チャット: コンテキスト=プロジェクトJSON要約+表示中レポート。§8のexplainerプロンプト。mock応答あり。  
- 確認事項ToDo: 診断の confirmWith×questions をチェックリスト化し、完了管理。

### M8: 地域パック(`packages/regionpack`)

- schema: `{ id, name, municipality, ordinances: NoteItem[], subsidies: SubsidyItem[], contacts: ContactItem[], localKnowledge: NoteItem[] }`(各Itemは title/summary/url?/verified:false)。  
- `packs/sanda/index.ts`: 構造を示すプレースホルダ(3〜5件、内容は「例: 」明記のダミー)。診断レポートに「地域情報(パック適用時)」セクションが出る配線のみ実装。

---

## §6. ルールDB初期セット(25本) — `packages/rules/src/data/`

すべて §5-M2 の `Rule` 形式で実装。verdictの語彙は「可能性が高い/条件付き/ハードルあり/難しい/情報不足」。条番号は下記に書いてあるものだけ使用可、それ以外は法令名のみ。

| \# | id | 内容(要点) | 主な確認先 |
| :---- | :---- | :---- | :---- |
| 1 | zoning-use-matrix | 13用途地域×8用途の適否マトリクス(建築基準法の用途制限の考え方に基づく簡略表。データテーブルとして実装し、`unknown`は情報不足verdict) | 都市計画課 |
| 2 | zoning-unknown-guide | 用途地域不明→調べ方ガイド提示 | 都市計画課 |
| 3 | chosei-kuiki | 市街化調整区域→原則として建築・用途変更に許可の論点。既存建築物の活用可否は自治体の審査基準次第である旨を平易に解説する専用ルート | 都市計画課/建築指導課 |
| 4 | hisenbiki-kuikigai | 非線引き・都市計画区域外→用途地域制限が緩い一方、他法令確認は残る旨 | 都市計画課 |
| 5 | setsudo | 接道: 幅員4m以上の道路に2m以上接しているか。満たさない場合は再建築・増改築に制約の可能性 | 建築指導課 |
| 6 | hatazao-missetsudo | 旗竿地・未接道→専門家確認強フラグ | 建築指導課/建築士 |
| 7 | yoto-henko-200 | 類似用途でない用途変更で延床200㎡超→建築確認申請が必要になる可能性(200㎡以下は手続きが軽い) | 建築指導課 |
| 8 | kensazumi-none | 検査済証なし→用途変更等の手続きハードル上昇。既存建築物の法適合状況調査という道がある旨 | 建築指導課/建築士 |
| 9 | minpaku-todokede | 住宅宿泊事業: 届出制・年間提供日数180日上限・自治体条例による上乗せ制限の確認 | 保健所/自治体民泊窓口 |
| 10 | kanihshukuhaku | 簡易宿所: 旅館業法の許可・構造設備基準・用途地域制限の確認 | 保健所/建築指導課 |
| 11 | inshokuten-kyoka | 飲食店営業許可: 区画・手洗い・シンク等の施設基準を図面段階で保健所に事前相談 | 保健所 |
| 12 | kashi-seizo | 菓子製造・食品製造は別許可の可能性 | 保健所 |
| 13 | share-house-kishukusha | シェアハウスは寄宿舎扱いとなり建築基準・消防が強化される可能性 | 建築指導課/消防 |
| 14 | shobo-setsubi | 用途・規模により消防用設備(自動火災報知設備等)・防火対象物の届出→消防署予防課に事前相談必須フラグ(特定用途は特に) | 消防署(予防課) |
| 15 | boka-junboka | 防火・準防火地域→改修時の材料・開口部の制約確認 | 建築指導課 |
| 16 | nochi | 地目が田・畑→農地法の許可(3条/4条/5条の別)を農業委員会に確認 | 農業委員会 |
| 17 | haisui-jokaso | 汲取・単独浄化槽→合併浄化槽/下水接続の転換検討項目と概算の桁感 | 上下水道 |
| 18 | kyu-taishin | 1981年以前の建築確認(旧耐震)・2000年以前の木造→耐震診断の推奨フラグ | 建築士 |
| 19 | kenyo-jutaku | 住まい+α: 低層住居系地域でも一定規模までの兼用住宅なら店舗等が可能な場合がある | 都市計画課 |
| 20 | kenpei-yoseki | 建蔽率・容積率は増築時に関与(内部改修のみなら通常論点にならない)旨のフラグ | 建築指導課 |
| 21 | gake-hazard | 崖地・ハザード該当可能性→確認項目化(自動判定は将来) | 都市計画課 |
| 22 | bunkazai-denken | 古民家は文化財・伝建地区・景観地区の該当可能性 | 文化財担当 |
| 23 | kyusui-shitei | 給水装置工事は自治体指定給水装置工事事業者のみ施工可 | 上下水道 |
| 24 | gas-koji | ガス工事は有資格者施工。プロパン/都市ガスの別確認 | 供給事業者 |
| 25 | denki-shikaku | コンセント増設・回路増設・スイッチ交換等は電気工事士資格が必要。照明器具の引掛シーリング交換等はDIY可 | — |

各ルールのユニットテスト: 代表入力3パターン(該当/非該当/unknown)。

---

## §7. 工事項目マスタ初期セット — `packages/estimate/src/data/work-items.ts`

書式:

interface WorkItem {

  id: string; category: string; name: string; unit: '㎡' | 'm' | '箇所' | '式' | '枚';

  materialUnitPrice: { low: number; high: number; verified: false; source: 'placeholder' };

  diyClass: 'diy' | 'diy\_hard' | 'licensed' | 'pro\_recommended' | 'permit\_related';

  requiredLicense?: string; permitNote?: string;

  steps: string\[\];              // 3〜6手順、平易に

  marketNote?: string;          // 専門施工の相場観メモ(参考・要検証表記)

}

カテゴリと項目数の目安(合計40±): 解体(間仕切り撤去/床解体/天井解体/残置物処分) 木工事(床下地組/根太・大引補修/造作棚/建具枠調整) 内装(フローリング/クッションフロア/畳表替/壁クロス/漆喰・珪藻土DIY/室内塗装) 建具(室内ドア交換/内窓設置/網戸) 水回り(キッチン交換※pro/トイレ交換※pro/洗面台/給排水管更新※licensed(指定工事店)/ユニットバス※pro) 電気(コンセント増設※licensed(電気工事士)/回路増設※licensed/照明器具交換(引掛シーリング)=diy/スイッチ交換※licensed) 断熱(床下断熱/天井断熱/内窓) 外部(外壁塗装※diy\_hard/屋根補修※pro\_recommended(高所)/雨樋) 設備(換気扇/エアコン設置※pro\_recommended) その他(シロアリ防除※pro\_recommended/ハウスクリーニング)。

**単価はすべてプレースホルダのレンジで入れ、`verified:false`。UIに「参考値・要検証」バッジ。** 実データ投入は人間TODO(§14)。

---

## §8. LLM統合仕様 — `packages/llm`

- クライアント: Anthropic SDK。`LLM_MODE=live|mock`。全呼び出しに zodスキーマ検証+1リトライ+フォールバック。プロンプトは `prompts/*.ts` でバージョン管理。  
- ロール別プロンプト:  
  1. `explainer`: ルールエンジンの構造化出力→平易な日本語へ。**システムプロンプトに明記: 入力に含まれない数値・条番号・価格を追加しない / 断定語を使わない / 不確実な点は不確実と言う。**  
  2. `hearing`: 改修要望ヒアリング(2〜5往復)→ §5-M6 の3案をtool useでJSON発行。幾何に存在しないID参照禁止(検証で弾く)。  
  3. `reportQA`: プロジェクト要約+レポートを文脈に質問応答。範囲外は「このツールでは判断できない」と答える。  
- mock実装: 各ロールに決定的なサンプル応答(サンプル間取りと整合するOp列を含む)。

---

## §9. UI/UX方針(簡潔に)

- 全文日本語。トーンは「隣に座る先輩」— 丁寧だが役所文書にしない。  
- 診断・チェックリストはスマホ幅優先。エディタはPC幅前提(スマホでは閲覧のみで可)。  
- 確度3色(グレー/黄/緑)を全画面で一貫。凡例を常設。  
- 印刷CSS対象: 診断レポート / 内見チェックリスト / 現況調査報告書 / 改修計画書。  
- 過剰な装飾より情報設計。フォントはシステム+Noto Sans JPで可。

## §10. 安全・免責・ガードレール

1. 固定免責文(全レポート末尾+初回起動時に表示): 「本ツールの診断・見積は情報整理を目的とした参考情報であり、法的助言、建築士による設計・調査、不動産取引の媒介ではありません。実際の可否・費用・安全性は、必ず所管行政庁および建築士等の専門家にご確認ください。」  
2. 断定語フィルタ: レポート生成テキストに「できます/問題ありません/不要です」を単独断定で使わない(ルールのsummary/detailの書き方規約としてレビュー)。  
3. 構造ゲート: `remove_partition` / `add_opening` は常に構造確認注記。`suspected` 壁は赤系警告。  
4. 価格の出所表示: `verified:false` の単価には常時バッジ。総額一本値は出さずレンジのみ。  
5. LLM出力はスキーマ検証を通過したものだけをUIに出す。生テキストの直接レンダリング禁止(XSS含む)。  
6. 個人情報: 住所等はローカル保存のみ。外部送信は geocode の住所文字列と、liveモード時のLLM入力のみ(READMEに明記)。

## §11. 今夜やらないこと(Non-goals tonight)

認証・課金 / デプロイ(Cloudflare設定) / GPUでの実モデル推論 / オープンデータの一括取込 / 単価の実データ化 / Web Bluetooth実機対応 / Gaussian Splattingビューア / 生成パース(画像) / PWA化 / 多言語。 → これらは NEXT\_STEPS.md に必ず記載して終える。

## §12. 実行計画(オーバーナイト運用)

配分はトークン・労力の目安。**各フェーズ完了時に必ず: ①テスト実行 ②git commit ③PROGRESS.md更新(1〜5行) ④デモ手順をREADMEに1行追記。**

- **P0 (〜15%) 基盤+コア:** モノレポscaffold、lint/format最小、`packages/core` の型・detectRooms・面積・snapToGrid・estimateModule・serialize+テスト。サンプル間取りfixture作成。  
- **P1 (〜25%) エディタ:** SVG 2Dエディタ(描画/選択/ドラッグ/開口/削除/寸法/確度3色/undo)+3Dプレビュー+サンプル読込。**最難関。3時間相当詰まったら機能を削って先へ(ドラッグ省略可、undo省略可。「描ける・直せる・面積が出る」を死守)。**  
- **P2 (〜20%) 診断:** ルール25本+テスト、モードB入力ウィザード、診断レポート(確認先マトリクス+質問テンプレ+印刷CSS)、モードA逆引き+内見チェックリスト。  
- **P3 (〜15%) 改修+見積:** 工事項目マスタseed、RenovationOp+validateOps/applyOps、takeoff連携、3案表示と見積(3区分レンジ)、hearing(mock必須・live任意)。  
- **P4 (〜10%) 実測:** 実測入力+solveConstraints+確度更新、計測ナビ(ヒューリスティクス)、劣化ピン、現況調査報告書。  
- **P5 (〜10%) recon+統合:** Python環境、make\_fixture、planes/walls/scale/export+pytest、エディタへのJSONインポート、ifc\_export(optional)、README整備、統合デモ確認。  
- **P6 (残り) 磨き:** §13を再点検→残余で品質向上(テスト追補、文言、印刷調整)。

**順序の例外:** P3〜P5は相互独立性が高い。詰まったら順序を入れ替えてよい(ASSUMPTIONSに記録)。

## §13. 受け入れ基準(朝、これが全部できていれば成功)

`pnpm i && pnpm dev`(+ `LLM_MODE=mock`、オフライン)で:

- [ ] モードA: 用途「カフェ」選択→条件+内見チェックリストが表示・印刷できる  
- [ ] モードB: 手入力(調整区域・地目=畑・延床250㎡・検査済証なし等の意地悪入力含む)→診断レポートが生成され、確認先マトリクスに質問テンプレが並ぶ  
- [ ] エディタ: サンプル間取り読込→壁を1枚消し、1枚描き→面積・畳数が追随  
- [ ] 改修: ヒアリング(mock)→3案表示→1案の見積(3区分レンジ+資格/構造フラグ+手順)が表示  
- [ ] 実測: 壁長を2本入力→モデル再計算→該当が緑に変わる→現況調査報告書が出る  
- [ ] recon: `pytest` green(fixture→壁抽出→間取りJSON→エディタにインポートできる)  
- [ ] `packages/{core,rules,estimate}` のvitest green  
- [ ] PROGRESS.md / ASSUMPTIONS.md / NEXT\_STEPS.md / README.md(セットアップ+デモ手順+§14の人間TODO転記)が最新

## §14. 人間(建石)のTODO — セッション外・朝以降

1. `ANTHROPIC_API_KEY` 設定→ `LLM_MODE=live` で hearing/explainer の実挙動確認  
2. Modalアカウント作成→ `modal_app.py` のデプロイと実動画での再構成テスト  
3. `docs/model-licenses.md` の各モデルのライセンス確認欄を埋める(**商用利用可否の確定は必須**)  
4. 国土数値情報(用途地域A29等)のデータ取得と `ZoningProvider` 実装着手判断  
5. 単価DBへの実データ投入(自前積算シート+物価資料)→ `verified:true` 化  
6. ルール25本の内容レビュー(実務目線での文言修正)  
7. レーザー距離計(DISTO/GLM)実機でのWeb Bluetooth検証(Android Chrome)  
8. 三田地域パックの実データ投入 / 免責文の最終文言チェック

## §15. 将来フェーズ(v2以降の展望 — 設計だけ壊さないこと)

Gaussian Splattingウォークスルー(feed-forward 3DGS) / 生成パース(深度条件付き画像生成) / 用途地域オープンデータ自動判定 / ジョブキュー(動画アップロード→Modal→結果通知) / 地域パック拡充(気仙沼→全国) / 場づくりナレッジ層(地域への入り方・合意形成・小さく始める設計の知見データベース) / 実測ログによる再構成精度の検証改善ループ / PWA・オフライン / 補助金検索。

---

## 付録A: セッション起動メッセージ(コピペ用)

REQUIREMENTS.md を最初から最後まで読んでください。

読了後、§0の実行指示と§12の実行計画に従い、P0から実装を開始してください。

不明点は質問で止まらず、ASSUMPTIONS.md に判断と理由を記録して進めてください。

各フェーズ完了ごとに テスト実行 → git commit → PROGRESS.md 更新 を必ず行ってください。

朝の時点で §13 の受け入れ基準がすべて満たされていることがゴールです。

## 付録B: 運用ファイルの書式

**PROGRESS.md**

\# 進捗ログ

\#\# P0 基盤+コア — 完了 (commit abc1234)

\- できたこと: …(1〜3行)

\- やらないことにした事: …(失敗した方針・理由)

\#\# P1 エディタ — 進行中

\- 現在地: …

**ASSUMPTIONS.md**

\# 判断記録

\- \[P0\] 部屋認識は最小回転ループ抽出で実装。理由: 単純で十分。代替: half-edge構造(過剰)。

**NEXT\_STEPS.md**

\# 次にやること(優先順)

1\. …(人間TODOは §14 から転記し \[human\] タグ)  
