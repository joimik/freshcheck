// IndexedDB wrapper — replaces the old server + SQLite stack. Everything lives
// on the user's device, so the app keeps working with no backend.

import type {
  Category,
  Item,
  ItemTemplate,
  NewItem,
  RecentBarcode,
  Stats,
} from '../types';

const DB_NAME = 'shelflife';
const DB_VERSION = 3; // v3: cleanup of unused shopping + add status_changed_at tracking
const STORE_ITEMS = 'items';
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

      if (!db.objectStoreNames.contains(STORE_ITEMS)) {
        const store = db.createObjectStore(STORE_ITEMS, { keyPath: 'id', autoIncrement: true });
        store.createIndex('expiry_date', 'expiry_date');
        store.createIndex('status', 'status');
      }

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

        if (!db.objectStoreNames.contains(STORE_TEMPLATES)) {
          const t = db.createObjectStore(STORE_TEMPLATES, { keyPath: 'id', autoIncrement: true });
          t.createIndex('product_name', 'product_name', { unique: false });
          t.createIndex('use_count', 'use_count', { unique: false });
        }
        if (!db.objectStoreNames.contains(STORE_RECENT_BARCODES)) {
          db.createObjectStore(STORE_RECENT_BARCODES, { keyPath: 'barcode' });
        }
      }

      // v3: drop the no-longer-used 'shopping' store if it exists
      if (oldVersion < 3 && db.objectStoreNames.contains('shopping')) {
        db.deleteObjectStore('shopping');
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
// AUTO-EXPIRE  — flips any active item past its expiry date to 'expired'.
// This is what makes the streak meaningful: items don't sit forever as
// 'active' when the date has passed.
// ─────────────────────────────────────────────────────────────────────────────

export async function autoExpirePastItems(): Promise<number> {
  const todayStr = today();
  const all = await tx<Item[]>(STORE_ITEMS, 'readonly', (s) => s.getAll());
  const toExpire = all.filter((i) => i.status === 'active' && i.expiry_date < todayStr);
  if (!toExpire.length) return 0;

  await Promise.all(
    toExpire.map((i) =>
      tx<IDBValidKey>(STORE_ITEMS, 'readwrite', (s) => s.put({ ...i, status: 'expired' }))
    )
  );
  return toExpire.length;
}

// ─────────────────────────────────────────────────────────────────────────────
// ITEMS
// ─────────────────────────────────────────────────────────────────────────────

export async function listActiveItems(): Promise<Item[]> {
  const rows = await tx<Item[]>(STORE_ITEMS, 'readonly', (store) => store.getAll());
  return rows
    .filter((i) => i.status === 'active')
    .map((i) => ({
      ...i,
      location: i.location ?? 'fridge',
      estimated_cost: i.estimated_cost ?? null,
    }))
    .sort((a, b) => a.expiry_date.localeCompare(b.expiry_date));
}

export async function listAllItems(): Promise<Item[]> {
  return tx<Item[]>(STORE_ITEMS, 'readonly', (s) => s.getAll());
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

// CO2 per item-saved in kg, weighted by category (rough but research-aligned).
const CO2_PER_ITEM: Record<Category, number> = {
  meat:       5.0,
  dairy:      1.5,
  produce:    0.5,
  condiments: 0.8,
  canned:     1.0,
  snacks:     1.0,
  medicine:   0.0,
  other:      1.0,
};

export async function getStats(): Promise<Stats> {
  const rows = await tx<Item[]>(STORE_ITEMS, 'readonly', (store) => store.getAll());
  const total_all = rows.length;
  const active = rows.filter((r) => r.status === 'active');
  const usedItems = rows.filter((r) => r.status === 'used');
  const expiredItems = rows.filter((r) => r.status === 'expired');
  const saved = usedItems.length;
  const expired = expiredItems.length;
  const finished = saved + expired;
  const waste_score = finished === 0 ? 0 : Math.round((expired / finished) * 100);
  const wasted_cost = expiredItems.reduce((sum, r) => sum + (r.estimated_cost ?? 0), 0);

  // Money + CO2 SAVED  (from items marked as 'used')
  const saved_money = usedItems.reduce((sum, r) => sum + (r.estimated_cost ?? 0), 0);
  const saved_co2 = usedItems.reduce(
    (sum, r) => sum + (CO2_PER_ITEM[r.category] ?? 1) * r.quantity,
    0
  );

  // Streak — consecutive days with no expired items
  const expiredDates = expiredItems.map((i) => i.expiry_date).sort();
  const lastWasteDay = expiredDates.length ? expiredDates[expiredDates.length - 1] : null;

  // Streak start fallback: first item ever added (so a fresh user sees 0 not 1000+)
  const firstAddedDate = rows.length
    ? rows.map((r) => r.added_date).sort()[0]
    : today();

  const todayDate = new Date(today() + 'T00:00:00').getTime();
  const referenceDate = lastWasteDay && lastWasteDay > firstAddedDate
    ? lastWasteDay
    : firstAddedDate;
  const refMs = new Date(referenceDate + 'T00:00:00').getTime();
  const streak = Math.max(0, Math.round((todayDate - refMs) / 86_400_000));
  const streak_broken_today = lastWasteDay === today();

  // Bucket items by ISO week (last 8 weeks)
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
    saved,
    expired,
    waste_score,
    by_week,
    wasted_cost,
    saved_money,
    saved_co2,
    streak,
    streak_broken_today,
  };
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
// RECENT BARCODES
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
