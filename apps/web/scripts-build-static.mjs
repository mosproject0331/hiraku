// 静的公開(GitHub Pages等)用のビルド。
// サーバーが無いので API ルートを一時的に外して書き出す。
import { execSync } from 'node:child_process';
import { existsSync, renameSync, rmSync } from 'node:fs';
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
} finally {
  restore();
}
