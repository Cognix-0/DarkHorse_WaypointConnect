// Tiny promise wrapper over IndexedDB (no dependency). Two stores:
//  kv     – cached route, last seen plan version, sync times
//  outbox – driver actions waiting to reach the server, keyed by eventId
const DB = 'waypoint-offline';
const VERSION = 1;

let dbp: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, VERSION);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
        if (!d.objectStoreNames.contains('outbox')) d.createObjectStore('outbox', { keyPath: 'eventId' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbp;
}

function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T> {
  return db().then((d) => new Promise<T>((resolve, reject) => {
    const tx = d.transaction(store, mode);
    const r = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(r ? (r.result as T) : (undefined as T));
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  }));
}

export const kvGet = <T>(key: string) => run<T | undefined>('kv', 'readonly', (s) => s.get(key) as IDBRequest<T | undefined>);
export const kvSet = (key: string, value: unknown) => run('kv', 'readwrite', (s) => { s.put(value, key); });
export const kvDel = (key: string) => run('kv', 'readwrite', (s) => { s.delete(key); });

export const outboxAll = <T>() => run<T[]>('outbox', 'readonly', (s) => s.getAll() as IDBRequest<T[]>);
export const outboxPut = (item: unknown) => run('outbox', 'readwrite', (s) => { s.put(item); });
export const outboxDelete = (ids: string[]) => run('outbox', 'readwrite', (s) => { for (const id of ids) s.delete(id); });
