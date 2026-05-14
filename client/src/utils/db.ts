// IndexedDB wrapper — replaces the old server + SQLite stack. Everything lives
// on the user's device, so the app keeps working with no backend.

import type {
  Item,
  ItemTemplate,
  NewItem,
  RecentBarcode,
  ShoppingItem,
  Stats,
} from '../types';

const DB_NAME = 'freshcheck';
const DB_VERSION = 2; // v2: adds shopping, templates, recent_barcodes stores + location/cost fields
const STORE_ITEMS = 'items';
const STORE_SHOPPING = 'shopping';
const STORE_TEMPLATES = 'templates';
const STORE_RECENT_BARCODES = 'recent_barcodes';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = req.result;
      const oldVersion = e.oldVersion;

      // v1 → first creation of items store
      if (!db.objectStoreNames.contains(STORE_ITEMS)) {
        const store = db.createObjectStore(STORE_ITEMS, {
          keyPath: 'id',
          autoIncrement: true,
        });
        store.createIndex('expiry_date', 'expiry_date');
        store.createIndex('status', 'status');
      }

      // v2 → backfill location='fridge' for existing items + add new stores
      if (oldVersion < 2) {
        const tx = req.transaction!;
        const itemsStore = tx.objectStore(STORE_ITEMS);
        const cursor = itemsStore.openCursor();
        cursor.onsuccess = () => {
          const c = cursor.result;
          if (!c) return;
          const v = c.value as Item;
          let changed = false;
          if (!v.location) { v.location = 'fridge'; changed = true; }
          if (v.estimated_cost === undefined) { v.estimated_cost = null; changed = true; }
          if (changed) c.update(v);
          c.continue();
        };

        if (!db.objectStoreNames.contains(STORE_SHOPPING)) {
          db.createObjectStore(STORE_SHOPPING, { keyPath: 'id', autoIncrement: true });
        }
        if (!db.objectStoreNames.contains(STORE_TEMPLATES)) {
          const t = db.createObjectStore(STORE_TEMPLATES, { keyPath: 'id', autoIncrement: true });
          t.createIndex('product_name', 'product_name', { unique: false });
          t.createIndex('use_count', 'use_count', { unique: false });
        }
        if (!db.objectStoreNames.contains(STORE_RECENT_BARCODES)) {
          db.createObjectStore(STORE_RECENT_BARCODES, { keyPath: 'barcode' });
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(
  storeName: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T> | Promise<T>
): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(storeName, mode);
        const store = transaction.objectStore(storeName);
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

// ─────────────────────────────────────────────────────────────────────────────
// ITEMS
// ─────────────────────────────────────────────────────────────────────────────

export async function listActiveItems(): Promise<Item[]> {
  const rows = await tx<Item[]>(STORE_ITEMS, 'readonly', (store) => store.getAll());
  return rows
    .filter((i) => i.status === 'active')
    .map((i) => ({
      ...i,
      // Defensive backfill in case migration missed an item
      location: i.location ?? 'fridge',
      estimated_cost: i.estimated_cost ?? null,
    }))
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
    location: item.location ?? 'fridge',
    estimated_cost: item.estimated_cost ?? null,
  };
  const id = await tx<IDBValidKey>(STORE_ITEMS, 'readwrite', (store) => store.add(record));
  return { ...record, id: Number(id) } as Item;
}

export async function updateItem(id: number, patch: Partial<Item>): Promise<Item> {
  return tx<Item>(STORE_ITEMS, 'readwrite', (store) => {
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
  await tx<undefined>(STORE_ITEMS, 'readwrite', (store) => store.delete(id));
}

export async function clearAllItems(): Promise<void> {
  await tx<undefined>(STORE_ITEMS, 'readwrite', (store) => store.clear());
}

export async function getStats(): Promise<Stats> {
  const rows = await tx<Item[]>(STORE_ITEMS, 'readonly', (store) => store.getAll());
  const total_all = rows.length;
  const active = rows.filter((r) => r.status === 'active');
  const used = rows.filter((r) => r.status === 'used').length;
  const expired = rows.filter((r) => r.status === 'expired');
  const finished = used + expired.length;
  const waste_score = finished === 0 ? 0 : Math.round((expired.length / finished) * 100);
  const wasted_cost = expired.reduce((sum, r) => sum + (r.estimated_cost ?? 0), 0);

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
    expired: expired.length,
    waste_score,
    by_week,
    wasted_cost,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SHOPPING LIST
// ─────────────────────────────────────────────────────────────────────────────

export async function listShopping(): Promise<ShoppingItem[]> {
  const rows = await tx<ShoppingItem[]>(STORE_SHOPPING, 'readonly', (s) => s.getAll());
  return rows.sort((a, b) => Number(a.done) - Number(b.done) || b.id - a.id);
}

export async function addShoppingItem(item: Omit<ShoppingItem, 'id' | 'added_date' | 'done'>): Promise<ShoppingItem> {
  const record = { ...item, done: false, added_date: today() };
  const id = await tx<IDBValidKey>(STORE_SHOPPING, 'readwrite', (s) => s.add(record));
  return { ...record, id: Number(id) } as ShoppingItem;
}

export async function toggleShoppingItem(id: number): Promise<void> {
  await tx<undefined>(STORE_SHOPPING, 'readwrite', (s) => {
    return new Promise<undefined>((resolve, reject) => {
      const getReq = s.get(id);
      getReq.onsuccess = () => {
        const existing = getReq.result as ShoppingItem | undefined;
        if (!existing) return reject(new Error('Not found'));
        existing.done = !existing.done;
        const putReq = s.put(existing);
        putReq.onsuccess = () => resolve(undefined);
        putReq.onerror = () => reject(putReq.error);
      };
      getReq.onerror = () => reject(getReq.error);
    }) as unknown as IDBRequest<undefined>;
  });
}

export async function deleteShoppingItem(id: number): Promise<void> {
  await tx<undefined>(STORE_SHOPPING, 'readwrite', (s) => s.delete(id));
}

export async function clearDoneShopping(): Promise<void> {
  const all = await listShopping();
  for (const it of all) if (it.done) await deleteShoppingItem(it.id);
}

// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATES (quick re-add for repeat items)
// ─────────────────────────────────────────────────────────────────────────────

export async function listTopTemplates(limit = 6): Promise<ItemTemplate[]> {
  const all = await tx<ItemTemplate[]>(STORE_TEMPLATES, 'readonly', (s) => s.getAll());
  return all.sort((a, b) => b.use_count - a.use_count).slice(0, limit);
}

export async function upsertTemplate(item: Item): Promise<void> {
  const all = await tx<ItemTemplate[]>(STORE_TEMPLATES, 'readonly', (s) => s.getAll());
  const existing = all.find(
    (t) => t.product_name.toLowerCase() === item.product_name.toLowerCase()
  );
  // Estimate shelf life from how far the expiry is from today
  const expiryMs = new Date(item.expiry_date + 'T00:00:00').getTime();
  const addedMs = new Date(item.added_date + 'T00:00:00').getTime();
  const shelf_days = Math.max(1, Math.round((expiryMs - addedMs) / 86_400_000));

  if (existing) {
    existing.use_count += 1;
    existing.last_used = today();
    if (item.image_url) existing.image_url = item.image_url;
    existing.default_quantity = item.quantity;
    existing.default_shelf_life_days = shelf_days;
    await tx<IDBValidKey>(STORE_TEMPLATES, 'readwrite', (s) => s.put(existing));
  } else {
    const record: Omit<ItemTemplate, 'id'> = {
      product_name: item.product_name,
      category: item.category,
      default_quantity: item.quantity,
      default_shelf_life_days: shelf_days,
      image_url: item.image_url,
      use_count: 1,
      last_used: today(),
    };
    await tx<IDBValidKey>(STORE_TEMPLATES, 'readwrite', (s) => s.add(record));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// RECENT BARCODES (quick re-add of recently scanned barcodes)
// ─────────────────────────────────────────────────────────────────────────────

export async function rememberBarcode(b: RecentBarcode): Promise<void> {
  await tx<IDBValidKey>(STORE_RECENT_BARCODES, 'readwrite', (s) => s.put(b));
}

export async function listRecentBarcodes(limit = 10): Promise<RecentBarcode[]> {
  const all = await tx<RecentBarcode[]>(STORE_RECENT_BARCODES, 'readonly', (s) => s.getAll());
  return all
    .sort((a, b) => b.scanned_at.localeCompare(a.scanned_at))
    .slice(0, limit);
}
