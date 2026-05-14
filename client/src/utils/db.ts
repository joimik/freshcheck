// IndexedDB wrapper — replaces the old server + SQLite stack. Everything lives
// on the user's device, so the app keeps working with no backend.

import type { Item, NewItem, Stats } from '../types';

const DB_NAME = 'freshcheck';
const DB_VERSION = 1;
const STORE_ITEMS = 'items';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_ITEMS)) {
        const store = db.createObjectStore(STORE_ITEMS, {
          keyPath: 'id',
          autoIncrement: true,
        });
        store.createIndex('expiry_date', 'expiry_date');
        store.createIndex('status', 'status');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T> | Promise<T>
): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE_ITEMS, mode);
        const store = transaction.objectStore(STORE_ITEMS);
        const result = run(store);
        if (result instanceof IDBRequest) {
          result.onsuccess = () => resolve(result.result);
          result.onerror = () => reject(result.error);
        } else {
          result.then(resolve, reject);
        }
      })
  );
}

const today = () => new Date().toISOString().slice(0, 10);

export async function listActiveItems(): Promise<Item[]> {
  const rows = await tx<Item[]>('readonly', (store) => store.getAll());
  return rows
    .filter((i) => i.status === 'active')
    .sort((a, b) => a.expiry_date.localeCompare(b.expiry_date));
}

export async function addItem(item: NewItem): Promise<Item> {
  const record: Omit<Item, 'id'> = {
    product_name: item.product_name,
    category: item.category,
    expiry_date: item.expiry_date,
    quantity: item.quantity || 1,
    notes: item.notes ?? null,
    added_date: today(),
    status: 'active',
    barcode: item.barcode ?? null,
    image_url: item.image_url ?? null,
  };
  const id = await tx<IDBValidKey>('readwrite', (store) => store.add(record));
  return { ...record, id: Number(id) } as Item;
}

export async function updateItem(id: number, patch: Partial<Item>): Promise<Item> {
  return tx<Item>('readwrite', (store) => {
    return new Promise<Item>((resolve, reject) => {
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const existing = getReq.result as Item | undefined;
        if (!existing) return reject(new Error('Item not found'));
        const updated = { ...existing, ...patch, id };
        const putReq = store.put(updated);
        putReq.onsuccess = () => resolve(updated);
        putReq.onerror = () => reject(putReq.error);
      };
      getReq.onerror = () => reject(getReq.error);
    });
  });
}

export async function deleteItem(id: number): Promise<void> {
  await tx<undefined>('readwrite', (store) => store.delete(id));
}

export async function clearAllItems(): Promise<void> {
  await tx<undefined>('readwrite', (store) => store.clear());
}

export async function getStats(): Promise<Stats> {
  const rows = await tx<Item[]>('readonly', (store) => store.getAll());
  const total_all = rows.length;
  const active = rows.filter((r) => r.status === 'active');
  const used = rows.filter((r) => r.status === 'used').length;
  const expired = rows.filter((r) => r.status === 'expired').length;
  const finished = used + expired;
  const waste_score = finished === 0 ? 0 : Math.round((expired / finished) * 100);

  // Bucket items by ISO week of their expiry date (last 8 weeks).
  const eightWeeksAgo = new Date();
  eightWeeksAgo.setDate(eightWeeksAgo.getDate() - 56);
  const cutoff = eightWeeksAgo.toISOString().slice(0, 10);

  const buckets = new Map<string, number>();
  for (const r of rows) {
    if (r.expiry_date < cutoff) continue;
    const d = new Date(r.expiry_date + 'T00:00:00');
    const year = d.getUTCFullYear();
    const oneJan = new Date(Date.UTC(year, 0, 1));
    const week = Math.ceil(
      ((d.getTime() - oneJan.getTime()) / 86_400_000 + oneJan.getUTCDay() + 1) / 7
    );
    const key = `${year}-W${String(week).padStart(2, '0')}`;
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  const by_week = [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, count]) => ({ week, count }));

  return {
    total_all,
    total_active: active.length,
    saved: used,
    expired,
    waste_score,
    by_week,
  };
}
