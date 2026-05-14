import type {
  Item,
  ItemTemplate,
  NewItem,
  RecentBarcode,
  Recipe,
  ShoppingItem,
  Stats,
} from '../types';
import {
  addItem,
  addShoppingItem,
  clearAllItems,
  clearDoneShopping,
  deleteItem,
  deleteShoppingItem,
  getStats,
  listActiveItems,
  listRecentBarcodes,
  listShopping,
  listTopTemplates,
  rememberBarcode,
  toggleShoppingItem,
  updateItem,
  upsertTemplate,
} from './db';

// Open Food Facts category → our internal category bucket.
const CATEGORY_MAP: Record<string, string> = {
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

function inferCategory(tags: string[] | undefined): string {
  if (!tags?.length) return 'other';
  for (const tag of tags) {
    if (CATEGORY_MAP[tag]) return CATEGORY_MAP[tag];
  }
  return 'other';
}

// Word stemming for matching expiring items against TheMealDB ingredient list.
function ingredientToken(name: string): string {
  return name
    .toLowerCase()
    .split(/[\s,]+/)[0]
    .replace(/s$/, ''); // strip trailing plural — TheMealDB uses singular forms
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

type BarcodeSpiderResponse = {
  status?: number;
  product?: {
    name?: string;
    brand?: string;
    category?: string;
    images?: string[];
  };
  error?: string;
};

// Result type shared by all barcode sources
type BarcodeResult = {
  product_name: string;
  category: string;
  image_url: string | null;
  source: string;
};

// ── Source 1: Open Food Facts (best for food, global) ───────────────────────
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

// ── Source 2: UPC Item DB (good for packaged goods, US + Asia) ───────────────
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

// ── Source 3: Open Beauty Facts (cosmetics, medicine, personal care) ─────────
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

// Infer category from a plain text string (for UPC Item DB)
function inferCategoryFromString(cat: string): string {
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

type Meal = { idMeal: string; strMeal: string; strMealThumb?: string };
type MealDetails = Meal & {
  strInstructions?: string;
  [key: `strIngredient${number}`]: string | undefined;
};

function splitSteps(instructions: string | undefined): string[] {
  if (!instructions) return [];
  return instructions
    .split(/\r?\n+|(?<=\.)\s+(?=[A-Z])/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3);
}

function extractIngredients(meal: MealDetails): string[] {
  const out: string[] = [];
  for (let i = 1; i <= 20; i++) {
    const ing = meal[`strIngredient${i}` as const];
    if (ing && ing.trim()) out.push(ing.trim().toLowerCase());
  }
  return out;
}

function estimatePrepTime(instructions: string | undefined): string {
  if (!instructions) return '20 min';
  const minMatch = instructions.match(/(\d+)\s*(?:min|minute)/i);
  if (minMatch) return `${minMatch[1]} min`;
  const hourMatch = instructions.match(/(\d+)\s*(?:hr|hour)/i);
  if (hourMatch) return `${hourMatch[1]} hr`;
  return '20 min';
}

export const api = {
  listItems: (): Promise<Item[]> => listActiveItems(),
  addItem: async (item: NewItem): Promise<Item> => {
    const added = await addItem(item);
    // Remember as a template for quick re-add next time
    upsertTemplate(added).catch(() => { /* ignore */ });
    return added;
  },
  updateItem: (id: number, patch: Partial<Item>): Promise<Item> => updateItem(id, patch),
  deleteItem: (id: number): Promise<{ ok: true }> =>
    deleteItem(id).then(() => ({ ok: true })),
  clearAll: (): Promise<void> => clearAllItems(),
  stats: (): Promise<Stats> => getStats(),

  // Shopping list
  listShopping: (): Promise<ShoppingItem[]> => listShopping(),
  addShoppingItem: (item: { name: string; category: 'meat' | 'dairy' | 'produce' | 'condiments' | 'canned' | 'snacks' | 'medicine' | 'other' }): Promise<ShoppingItem> =>
    addShoppingItem(item),
  toggleShoppingItem: (id: number): Promise<void> => toggleShoppingItem(id),
  deleteShoppingItem: (id: number): Promise<void> => deleteShoppingItem(id),
  clearDoneShopping: (): Promise<void> => clearDoneShopping(),

  // Templates + recent barcodes
  listTopTemplates: (): Promise<ItemTemplate[]> => listTopTemplates(),
  listRecentBarcodes: (): Promise<RecentBarcode[]> => listRecentBarcodes(),

  async scanBarcode(barcode: string) {
    // Try 3 databases in parallel — use whichever responds first with a result.
    // Open Food Facts  → best for food worldwide
    // UPC Item DB      → good for packaged goods, Asian products
    // Open Beauty Facts → cosmetics, medicine, personal care
    const [off, upc, obf] = await Promise.all([
      tryOpenFoodFacts(barcode),
      tryUPCItemDB(barcode),
      tryOpenBeautyFacts(barcode),
    ]);

    const result = off ?? upc ?? obf;
    if (!result) throw new Error('Product not found in any database');

    // Remember this barcode so user can quickly re-add the same product
    rememberBarcode({
      barcode,
      product_name: result.product_name,
      category: result.category as import('../types').Category,
      image_url: result.image_url,
      scanned_at: new Date().toISOString(),
    }).catch(() => { /* ignore */ });

    return {
      product_name: result.product_name,
      category: result.category,
      image_url: result.image_url,
    };
  },

  async generateRecipes(ingredients: string[]): Promise<{ recipes: Recipe[] }> {
    if (!ingredients.length) return { recipes: [] };

    const tokens = [...new Set(ingredients.map(ingredientToken))].filter(Boolean);

    const lookups = await Promise.all(
      tokens.map(async (ing) => {
        const url = `https://www.themealdb.com/api/json/v1/1/filter.php?i=${encodeURIComponent(ing)}`;
        const r = await fetch(url);
        if (!r.ok) return { ing, meals: [] as Meal[] };
        const data = (await r.json()) as { meals: Meal[] | null };
        return { ing, meals: data.meals ?? [] };
      })
    );

    const scoreMap = new Map<string, { meal: Meal; matched: Set<string> }>();
    for (const { ing, meals } of lookups) {
      for (const m of meals) {
        const entry = scoreMap.get(m.idMeal) ?? { meal: m, matched: new Set() };
        entry.matched.add(ing);
        scoreMap.set(m.idMeal, entry);
      }
    }
    const ranked = [...scoreMap.values()]
      .sort((a, b) => b.matched.size - a.matched.size)
      .slice(0, 3);
    if (!ranked.length) return { recipes: [] };

    const details = await Promise.all(
      ranked.map(async ({ meal, matched }) => {
        const url = `https://www.themealdb.com/api/json/v1/1/lookup.php?i=${meal.idMeal}`;
        const r = await fetch(url);
        const data = (await r.json()) as { meals: MealDetails[] | null };
        const full = data.meals?.[0];
        if (!full) return null;
        return {
          name: full.strMeal,
          prep_time: estimatePrepTime(full.strInstructions),
          steps: splitSteps(full.strInstructions),
          uses_ingredients: [...matched],
          all_ingredients: extractIngredients(full),
          thumbnail: full.strMealThumb ?? null,
          source: `https://www.themealdb.com/meal/${full.idMeal}`,
        } as Recipe;
      })
    );

    return { recipes: details.filter((r): r is Recipe => r !== null) };
  },
};
