#!/bin/bash
# HIRAKU — ダブルクリックで起動します
cd "$(dirname "$0")"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
PORT=3000

echo ""
echo "  ┌──────────────────────────────┐"
echo "  │   HIRAKU  空き家活用支援ツール   │"
echo "  └──────────────────────────────┘"
echo ""

if lsof -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1; then
  echo "  すでに起動しています。ブラウザを開きます。"
  open "http://localhost:$PORT"
  sleep 2
  exit 0
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "  pnpm が見つかりません。ターミナルで次を実行してください:"
  echo ""
  echo "      npm install -g pnpm"
  echo ""
  read -n 1 -s -r -p "  何かキーを押すと閉じます"
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "  初回セットアップ中です（3〜5分ほどかかります）..."
  pnpm install --dangerously-allow-all-builds || {
    echo "  セットアップに失敗しました。"
    read -n 1 -s -r -p "  何かキーを押すと閉じます"; exit 1
  }
fi

# ソースがビルドより新しければ作り直す（作り忘れによる表示崩れを防ぐ）
NEED_BUILD=0
if [ ! -f apps/web/.next/BUILD_ID ]; then
  NEED_BUILD=1
else
  NEWER=$(find apps/web/src apps/web/public packages -type f \
            \( -name '*.ts' -o -name '*.tsx' -o -name '*.css' -o -name '*.json' -o -name '*.svg' -o -name '*.png' \) \
            -newer apps/web/.next/BUILD_ID -print -quit 2>/dev/null)
  [ -n "$NEWER" ] && NEED_BUILD=1
fi

if [ $NEED_BUILD -eq 1 ]; then
  echo "  変更を反映しています（1〜2分）..."
  pnpm --filter web build || {
    echo "  ビルドに失敗しました。"
    read -n 1 -s -r -p "  何かキーを押すと閉じます"; exit 1
  }
fi

echo "  起動しています..."
echo ""
echo "  このMacから    http://localhost:$PORT"
IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)
[ -n "$IP" ] && echo "  同じWi-Fiのスマホから  http://$IP:$PORT"
echo ""
echo "  終了するときは、このウィンドウで  Control + C"
echo ""

( sleep 3; open "http://localhost:$PORT" ) &
exec pnpm --filter web start
