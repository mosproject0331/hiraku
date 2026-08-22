#!/bin/bash
# HIRAKU 開発モード（コードを直すと即反映）
cd "$(dirname "$0")"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
( sleep 4; open "http://localhost:3000" ) &
exec pnpm --filter web dev
