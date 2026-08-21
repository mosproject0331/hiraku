import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Project, Repository } from '@hiraku/core';

const DATA_DIR = path.join(process.cwd(), '.data', 'projects');

function safeId(id: string): string {
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id)) throw new Error('不正なIDです');
  return id;
}

/** ローカルJSONファイル実装(§3-2)。Route Handlerからのみ使う */
export class LocalJsonRepository implements Repository {
  async list(): Promise<{ id: string; name: string; updatedAt: string }[]> {
    await mkdir(DATA_DIR, { recursive: true });
    const files = (await readdir(DATA_DIR)).filter((f) => f.endsWith('.json'));
    const out: { id: string; name: string; updatedAt: string }[] = [];
    for (const f of files) {
      try {
        const p = JSON.parse(await readFile(path.join(DATA_DIR, f), 'utf8')) as Project;
        out.push({ id: p.id, name: p.name, updatedAt: p.updatedAt });
      } catch {
        // 壊れたファイルは一覧から除外
      }
    }
    return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async get(id: string): Promise<Project | null> {
    try {
      return JSON.parse(await readFile(path.join(DATA_DIR, safeId(id) + '.json'), 'utf8')) as Project;
    } catch {
      return null;
    }
  }

  async save(project: Project): Promise<void> {
    await mkdir(DATA_DIR, { recursive: true });
    await writeFile(
      path.join(DATA_DIR, safeId(project.id) + '.json'),
      JSON.stringify(project, null, 2),
    );
  }

  async remove(id: string): Promise<void> {
    await rm(path.join(DATA_DIR, safeId(id) + '.json'), { force: true });
  }
}

export const repo: Repository = new LocalJsonRepository();
