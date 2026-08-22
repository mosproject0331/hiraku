// 静的公開(GitHub Pages等)用のビルド。
// サーバーが無いので API ルートを一時的に外して書き出す。
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const api = path.join('src', 'app', 'api');
const stash = path.join('.api-stash');

function restore() {
  if (existsSync(stash)) {
    rmSync(api, { recursive: true, force: true });
    renameSync(stash, api);
  }
}
process.on('exit', restore);
process.on('SIGINT', () => { restore(); process.exit(1); });

try {
  if (existsSync(api)) renameSync(api, stash);
  execSync('next build', {
    stdio: 'inherit',
    env: { ...process.env, NEXT_PUBLIC_STATIC: '1' },
  });
  stampServiceWorker();
} finally {
  restore();
}

// サービスワーカーに書き出しの印を押す。
// 中身が同じだとブラウザが入れ替えず、先読みが古いまま残るため。
function stampServiceWorker() {
  const sw = path.join('out', 'sw.js');
  if (!existsSync(sw)) return;
  const stamp =
    process.env.GITHUB_SHA?.slice(0, 8) ??
    new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  writeFileSync(sw, readFileSync(sw, 'utf8').replaceAll('__BUILD__', stamp));
  console.log(`sw.js に印を押しました: ${stamp}`);
}
