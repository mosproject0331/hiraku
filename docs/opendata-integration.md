# 用途地域オープンデータ連携の設計メモ(将来実装)

## 現状
`ZoningProvider` インターフェースのみ定義済み(packages/rules)。実装は `ManualZoningProvider`(常にunknown)。

## 実装方針
- データ源: 国土数値情報 用途地域データ(A29)。GeoJSON/シェープファイル。市区町村単位でダウンロード
- 手順案:
  1. 対象自治体のA29をGeoJSONへ変換(ogr2ogr)し、`packages/regionpack/packs/<region>/zoning.geojson` に同梱
  2. `GeoJsonZoningProvider implements ZoningProvider`: 点(lat,lng)のポリゴン内包判定(point-in-polygon)で用途地域コード→YoutoChiiki へマップ
  3. データが無い地点は 'unknown' を返す(既存の調べ方ガイドに接続)
- 注意: A29は整備年次が古い自治体があり、最新の都市計画決定と食い違うことがある。
  自動判定結果にも必ず「都市計画課で確認」の文言を付ける(断定しない原則を崩さない)

## 人間TODO
- 対象自治体(例: 三田市)のA29データ取得とライセンス表記の確認
- 用途地域コード→13区分のマッピング表の確認
