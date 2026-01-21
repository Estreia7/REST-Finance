// Minimal IndexedDB helper for caching dashboard payloads and queued mutations.

const DB_NAME = 'rest-finance-offline';
const DB_VERSION = 1;
const STORE_CACHE = 'cache';
const STORE_QUEUE = 'queue';

export type CachedDashboard = {
  restaurantId: string;
  payload: unknown;
  updatedAt: number;
};

export type QueuedEntry =
  | {
      type: 'daily_summary';
      body: any;
    }
  | {
      type: 'cost_entry';
      body: any;
    };

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_CACHE)) {
        db.createObjectStore(STORE_CACHE, { keyPath: 'restaurantId' });
      }
      if (!db.objectStoreNames.contains(STORE_QUEUE)) {
        db.createObjectStore(STORE_QUEUE, { autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function cacheDashboard(data: CachedDashboard) {
  const db = await openDb();
  const tx = db.transaction(STORE_CACHE, 'readwrite');
  tx.objectStore(STORE_CACHE).put(data);
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getCachedDashboard(
  restaurantId: string
): Promise<CachedDashboard | undefined> {
  const db = await openDb();
  const tx = db.transaction(STORE_CACHE, 'readonly');
  const store = tx.objectStore(STORE_CACHE);
  const req = store.get(restaurantId);
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result as CachedDashboard | undefined);
    req.onerror = () => reject(req.error);
  });
}

export async function enqueueMutation(entry: QueuedEntry) {
  const db = await openDb();
  const tx = db.transaction(STORE_QUEUE, 'readwrite');
  tx.objectStore(STORE_QUEUE).add(entry);
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function drainQueue(): Promise<QueuedEntry[]> {
  const db = await openDb();
  const tx = db.transaction(STORE_QUEUE, 'readwrite');
  const store = tx.objectStore(STORE_QUEUE);
  const items: QueuedEntry[] = [];

  return new Promise((resolve, reject) => {
    const cursorReq = store.openCursor();
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (cursor) {
        items.push(cursor.value as QueuedEntry);
        store.delete(cursor.primaryKey);
        cursor.continue();
      } else {
        resolve(items);
      }
    };
    cursorReq.onerror = () => reject(cursorReq.error);
  });
}

