#!/bin/bash
# HIRAKU — ダブルクリックで起動します
cd "$(dirname "$0")"

PORT=3000

echo ""
echo "  ┌──────────────────────────────┐"
echo "  │   HIRAKU  空き家活用支援ツール   │"
echo "  └──────────────────────────────┘"
echo ""

# すでに起動していれば、ブラウザを開くだけ
if lsof -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1; then
  echo "  すでに起動しています。ブラウザを開きます。"
  open "http://localhost:$PORT"
  sleep 2
  exit 0
fi

# pnpm の確認（Homebrew の node/npm も探す）
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! command -v pnpm >/dev/null 2>&1; then
  echo "  pnpm が見つかりません。ターミナルで次を実行してください:"
  echo ""
  echo "      npm install -g pnpm"
  echo ""
  read -n 1 -s -r -p "  何かキーを押すと閉じます"
  exit 1
fi

# 初回セットアップ
if [ ! -d node_modules ]; then
  echo "  初回セットアップ中です（3〜5分ほどかかります）..."
  pnpm install --dangerously-allow-all-builds || {
    echo "  セットアップに失敗しました。"
    read -n 1 -s -r -p "  何かキーを押すと閉じます"
    exit 1
  }
fi

# ビルドが無ければ作る
if [ ! -d apps/web/.next ]; then
  echo "  初回ビルド中です（1〜2分）..."
  pnpm --filter web build || {
    echo "  ビルドに失敗しました。"
    read -n 1 -s -r -p "  何かキーを押すと閉じます"
    exit 1
  }
fi

echo "  起動しています..."
echo ""
echo "  ブラウザで  http://localhost:$PORT  が開きます"
echo "  終了するときは、このウィンドウで  Control + C"
echo ""

( sleep 3; open "http://localhost:$PORT" ) &
exec pnpm --filter web start
