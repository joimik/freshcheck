import type {
  Category,
  Item,
  ItemTemplate,
  NewItem,
  RecentBarcode,
  Stats,
} from '../types';
import {
  addItem,
  autoExpirePastItems,
  clearAllItems,
  deleteItem,
  getStats,
  listActiveItems,
  listRecentBarcodes,
  listTopTemplates,
  rememberBarcode,
  updateItem,
  upsertTemplate,
} from './db';

// Open Food Facts category → our internal category bucket.
const CATEGORY_MAP: Record<string, Category> = {
  'en:meats': 'meat',
  'en:dairies': 'dairy',
  'en:milks': 'dairy',
  'en:cheeses': 'dairy',
  'en:yogurts': 'dairy',
  'en:fruits': 'produce',
  'en:vegetables': 'produce',
  'en:fruits-and-vegetables-based-foods': 'produce',
  'en:condiments': 'condiments',
  'en:sauces': 'condiments',
  'en:canned-foods': 'canned',
  'en:snacks': 'snacks',
  'en:sweet-snacks': 'snacks',
  'en:salty-snacks': 'snacks',
  'en:medicines': 'medicine',
};

function inferCategory(tags: string[] | undefined): Category {
  if (!tags?.length) return 'other';
  for (const tag of tags) {
    if (CATEGORY_MAP[tag]) return CATEGORY_MAP[tag];
  }
  return 'other';
}

type OpenFoodFactsResponse = {
  status: number;
  product?: {
    product_name?: string;
    brands?: string;
    categories_tags?: string[];
    image_front_url?: string;
  };
};

type UPCItemDBResponse = {
  code: string;
  items?: {
    title?: string;
    brand?: string;
    category?: string;
    images?: string[];
  }[];
};

type BarcodeResult = {
  product_name: string;
  category: Category;
  image_url: string | null;
  source: string;
};

async function tryOpenFoodFacts(barcode: string): Promise<BarcodeResult | null> {
  try {
    const r = await fetch(
      `https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(barcode)}.json`
    );
    if (!r.ok) return null;
    const data = (await r.json()) as OpenFoodFactsResponse;
    if (data.status !== 1 || !data.product) return null;
    const name = data.product.product_name || data.product.brands;
    if (!name) return null;
    return {
      product_name: name,
      category: inferCategory(data.product.categories_tags),
      image_url: data.product.image_front_url ?? null,
      source: 'Open Food Facts',
    };
  } catch {
    return null;
  }
}

async function tryUPCItemDB(barcode: string): Promise<BarcodeResult | null> {
  try {
    const r = await fetch(
      `https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(barcode)}`
    );
    if (!r.ok) return null;
    const data = (await r.json()) as UPCItemDBResponse;
    if (data.code !== 'OK' || !data.items?.length) return null;
    const item = data.items[0];
    const name = item.title || item.brand;
    if (!name) return null;
    return {
      product_name: name,
      category: inferCategoryFromString(item.category ?? ''),
      image_url: item.images?.[0] ?? null,
      source: 'UPC Item DB',
    };
  } catch {
    return null;
  }
}

async function tryOpenBeautyFacts(barcode: string): Promise<BarcodeResult | null> {
  try {
    const r = await fetch(
      `https://world.openbeautyfacts.org/api/v0/product/${encodeURIComponent(barcode)}.json`
    );
    if (!r.ok) return null;
    const data = (await r.json()) as OpenFoodFactsResponse;
    if (data.status !== 1 || !data.product) return null;
    const name = data.product.product_name || data.product.brands;
    if (!name) return null;
    return {
      product_name: name,
      category: 'other',
      image_url: data.product.image_front_url ?? null,
      source: 'Open Beauty Facts',
    };
  } catch {
    return null;
  }
}

function inferCategoryFromString(cat: string): Category {
  const c = cat.toLowerCase();
  if (/meat|beef|pork|chicken|fish|seafood/.test(c)) return 'meat';
  if (/dairy|milk|cheese|yogurt|butter/.test(c)) return 'dairy';
  if (/fruit|vegetable|produce|fresh/.test(c)) return 'produce';
  if (/sauce|condiment|dressing|seasoning|spice/.test(c)) return 'condiments';
  if (/can|canned|tin|preserved/.test(c)) return 'canned';
  if (/snack|candy|chip|cookie|sweet|biscuit/.test(c)) return 'snacks';
  if (/medicine|drug|vitamin|supplement|health/.test(c)) return 'medicine';
  return 'other';
}

export const api = {
  listItems: (): Promise<Item[]> => listActiveItems(),
  autoExpire: (): Promise<number> => autoExpirePastItems(),
  addItem: async (item: NewItem): Promise<Item> => {
    const added = await addItem(item);
    upsertTemplate(added).catch(() => { /* ignore */ });
    return added;
  },
  updateItem: (id: number, patch: Partial<Item>): Promise<Item> => updateItem(id, patch),
  deleteItem: (id: number): Promise<{ ok: true }> =>
    deleteItem(id).then(() => ({ ok: true })),
  clearAll: (): Promise<void> => clearAllItems(),
  stats: (): Promise<Stats> => getStats(),

  listTopTemplates: (): Promise<ItemTemplate[]> => listTopTemplates(),
  listRecentBarcodes: (): Promise<RecentBarcode[]> => listRecentBarcodes(),

  async scanBarcode(barcode: string) {
    const [off, upc, obf] = await Promise.all([
      tryOpenFoodFacts(barcode),
      tryUPCItemDB(barcode),
      tryOpenBeautyFacts(barcode),
    ]);

    const result = off ?? upc ?? obf;
    if (!result) throw new Error('Product not found in any database');

    rememberBarcode({
      barcode,
      product_name: result.product_name,
      category: result.category,
      image_url: result.image_url,
      scanned_at: new Date().toISOString(),
    }).catch(() => { /* ignore */ });

    return {
      product_name: result.product_name,
      category: result.category,
      image_url: result.image_url,
    };
  },
};
