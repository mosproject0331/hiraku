#!/bin/bash
# HIRAKU をローカルで起動して、ブラウザで開く
cd "$(dirname "$0")"

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm が見つかりません。先に  npm install -g pnpm  を実行してください。"
  read -n 1 -s -r -p "何かキーを押すと閉じます"
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "初回セットアップ中です（数分かかります）..."
  pnpm install --dangerously-allow-all-builds
fi

echo ""
echo "  HIRAKU を起動します"
echo "  ブラウザで http://localhost:3000 が開きます"
echo "  終了するには、このウィンドウで Control + C"
echo ""

( sleep 4; open "http://localhost:3000" ) &
pnpm --filter web dev
