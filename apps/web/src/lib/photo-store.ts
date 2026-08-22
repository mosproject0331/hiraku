/**
 * 現場で撮った写真の置き場。
 *
 * 写真はすぐに数MBになるので、localStorage（おおむね5MB）ではなく IndexedDB に置く。
 * 端末の中だけで完結し、どこにも送らない。
 */

const DB_NAME = 'hiraku-photos';
const STORE = 'photos';
const VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('この端末では写真を保存できません'));
      return;
    }
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('写真の保存領域を開けませんでした'));
  });
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error('写真を読み書きできませんでした'));
      }),
  );
}

/** 保存領域がいっぱいのときに投げる */
export class PhotoQuotaError extends Error {
  constructor() {
    super('この端末の保存領域がいっぱいです');
    this.name = 'PhotoQuotaError';
  }
}

export function putPhoto(id: string, dataUrl: string): Promise<unknown> {
  return tx('readwrite', (s) => s.put(dataUrl, id)).catch((e: unknown) => {
    const name = (e as { name?: string } | null)?.name ?? '';
    if (name === 'QuotaExceededError' || /quota/i.test(String(e))) throw new PhotoQuotaError();
    throw e;
  });
}

/** いまどれだけ使っているか。ブラウザが教えてくれるときだけ */
export async function storageUse(): Promise<{ usedMb: number; quotaMb: number } | null> {
  try {
    const s = navigator.storage;
    if (!s?.estimate) return null;
    const e = await s.estimate();
    if (!e.usage || !e.quota) return null;
    return { usedMb: e.usage / 1048576, quotaMb: e.quota / 1048576 };
  } catch {
    return null;
  }
}

export function getPhoto(id: string): Promise<string | undefined> {
  return tx<string | undefined>('readonly', (s) => s.get(id));
}

export function deletePhoto(id: string): Promise<unknown> {
  return tx('readwrite', (s) => s.delete(id));
}

/** まとめて取り出す。並び順は渡した順のまま */
export async function getPhotos(ids: string[]): Promise<(string | undefined)[]> {
  const out: (string | undefined)[] = [];
  for (const id of ids) out.push(await getPhoto(id).catch(() => undefined));
  return out;
}

/** いま入っている写真のだいたいの容量(バイト) */
export async function photoBytes(): Promise<number> {
  try {
    const keys = await tx<IDBValidKey[]>('readonly', (s) => s.getAllKeys());
    const vals = await Promise.all(keys.map((k) => getPhoto(String(k))));
    return vals.reduce((n, v) => n + (v?.length ?? 0), 0);
  } catch {
    return 0;
  }
}
