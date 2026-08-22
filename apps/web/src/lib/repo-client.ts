import type { Project } from '@hiraku/core';

/**
 * プロジェクトの保存先。この端末のブラウザの中だけに置く。
 * サーバーに送らないので、公開環境でも他人に見られることがない。
 */
const KEY = 'hiraku-projects';

export interface ProjectSummary {
  id: string;
  name: string;
  updatedAt: string;
}

function readAll(): Record<string, Project> {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(window.localStorage.getItem(KEY) ?? '{}') as Record<string, Project>;
  } catch {
    return {};
  }
}

function writeAll(all: Record<string, Project>): void {
  window.localStorage.setItem(KEY, JSON.stringify(all));
}

export function listProjects(): ProjectSummary[] {
  return Object.values(readAll())
    .map((p) => ({ id: p.id, name: p.name, updatedAt: p.updatedAt }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getProject(id: string): Project | null {
  return readAll()[id] ?? null;
}

export function saveProject(project: Project): { ok: true } | { ok: false; error: string } {
  const all = readAll();
  const now = new Date().toISOString();
  all[project.id] = { ...project, updatedAt: now, createdAt: project.createdAt || now };
  try {
    writeAll(all);
    return { ok: true };
  } catch {
    return {
      ok: false,
      error:
        'この端末の保存領域がいっぱいです。下絵の画像が大きい可能性があります。古いプロジェクトを削除するか、下絵を外してからもう一度お試しください。',
    };
  }
}

export function removeProject(id: string): void {
  const all = readAll();
  delete all[id];
  writeAll(all);
}

/** 端末を移るとき用の書き出し／読み込み */
export function exportProject(project: Project): void {
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (project.name || 'project').replace(/[/\\?%*:|"<>]/g, '_') + '.hiraku.json';
  a.click();
  URL.revokeObjectURL(a.href);
}
