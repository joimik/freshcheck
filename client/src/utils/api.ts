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

// Open Products Facts — general consumer goods (electronics, household, toys, etc.)
async function tryOpenProductsFacts(barcode: string): Promise<BarcodeResult | null> {
  try {
    const r = await fetch(
      `https://world.openproductsfacts.org/api/v0/product/${encodeURIComponent(barcode)}.json`
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
      source: 'Open Products Facts',
    };
  } catch {
    return null;
  }
}

// Wikidata — encyclopedia of structured data, includes EAN/UPC barcodes for
// many products. Free, no API key. Coverage is sparse but quality is high.
async function tryWikidata(barcode: string): Promise<BarcodeResult | null> {
  try {
    // P3962 = GTIN-13 / EAN, P3964 = GTIN-12 / UPC-A
    const sparql = `SELECT ?item ?itemLabel ?image WHERE {
      { ?item wdt:P3962 "${barcode}" } UNION { ?item wdt:P3964 "${barcode}" }
      OPTIONAL { ?item wdt:P18 ?image }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en,id". }
    } LIMIT 1`;
    const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(sparql)}`;
    const r = await fetch(url, {
      headers: { Accept: 'application/sparql-results+json' },
    });
    if (!r.ok) return null;
    const data = await r.json();
    const binding = data.results?.bindings?.[0];
    if (!binding?.itemLabel?.value) return null;
    return {
      product_name: binding.itemLabel.value,
      category: 'other',
      image_url: binding.image?.value || null,
      source: 'Wikidata',
    };
  } catch {
    return null;
  }
}

// Web-search fallback. When every structured database fails, search the
// open web for the barcode number itself and extract the first result's
// title as a best-guess product name. Uses a free CORS proxy because most
// search engines don't expose CORS.
//
// Quality is lower than a real database hit, so this only runs as a last
// resort, and we mark the source so the UI can flag it.
async function tryWebSearch(barcode: string): Promise<BarcodeResult | null> {
  // CORS proxies — rotate through in case one is down/rate-limited
  const proxies = [
    (u: string) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
    (u: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
    (u: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
  ];

  // DuckDuckGo HTML — has a stable structure we can regex out of
  const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(barcode + ' product')}`;

  for (const wrap of proxies) {
    try {
      const r = await fetch(wrap(searchUrl));
      if (!r.ok) continue;
      const html = await r.text();

      // DuckDuckGo result titles use class="result__a"
      const titleMatches = [...html.matchAll(/<a[^>]*class="result__a"[^>]*>([^<]+)<\/a>/g)];
      if (!titleMatches.length) continue;

      // Score results by how product-like they look: longer titles with
      // letters score higher than pure numeric/junk results.
      for (const m of titleMatches.slice(0, 5)) {
        const raw = m[1]
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&nbsp;/g, ' ')
          .trim();

        // Most search results format as "Product — Site Name" or "Product | Site"
        const productPart = raw.split(/\s+[-–|]\s+/)[0].trim();

        // Reject if too short, all digits, or obviously generic
        if (productPart.length < 4) continue;
        if (/^\d+$/.test(productPart)) continue;
        if (/^(home|buy|shop|amazon|ebay)$/i.test(productPart)) continue;

        return {
          product_name: productPart.slice(0, 80),
          category: 'other',
          image_url: null,
          source: 'Web search',
        };
      }
    } catch {
      continue;
    }
  }
  return null;
}

// Open Pet Food Facts — pet food and treats
async function tryOpenPetFoodFacts(barcode: string): Promise<BarcodeResult | null> {
  try {
    const r = await fetch(
      `https://world.openpetfoodfacts.org/api/v0/product/${encodeURIComponent(barcode)}.json`
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
      source: 'Open Pet Food Facts',
    };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TEXT-BASED PRODUCT SEARCH
// When OCR reads product text off a label (e.g. "INDOMIE GORENG"), search the
// product databases by name. This bridges OCR (which we already run for date
// extraction) and the product database, turning every photo into a lookup.
// ─────────────────────────────────────────────────────────────────────────────

type TextSearchResponse = {
  count?: number;
  products?: {
    product_name?: string;
    brands?: string;
    image_front_url?: string;
    image_url?: string;
    categories_tags?: string[];
    code?: string;
  }[];
};

async function searchByTextOnHost(host: string, query: string): Promise<BarcodeResult | null> {
  try {
    const url =
      `https://${host}/cgi/search.pl?` +
      `search_terms=${encodeURIComponent(query)}` +
      `&search_simple=1&action=process&json=1&page_size=5` +
      `&fields=product_name,brands,image_front_url,image_url,categories_tags,code`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const data = (await r.json()) as TextSearchResponse;
    if (!data.products?.length) return null;

    // Pick the first product that has both a name AND an image (best quality).
    // Fall back to anything with a name.
    const withImage = data.products.find(
      (p) => (p.product_name || p.brands) && (p.image_front_url || p.image_url)
    );
    const fallback = data.products.find((p) => p.product_name || p.brands);
    const pick = withImage || fallback;
    if (!pick) return null;

    return {
      product_name: pick.product_name || pick.brands || 'Unknown',
      category:
        host.includes('beauty')
          ? 'other'
          : host.includes('petfood')
          ? 'other'
          : inferCategory(pick.categories_tags),
      image_url: pick.image_front_url || pick.image_url || null,
      source: host,
    };
  } catch {
    return null;
  }
}

export async function searchProductByText(query: string): Promise<BarcodeResult | null> {
  // Clean the query — keep only word-like tokens, drop the noise OCR introduces
  const clean = query
    .replace(/[^A-Za-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (clean.length < 3) return null;

  // Search 3 OFF-family databases in parallel
  const [food, beauty, products] = await Promise.all([
    searchByTextOnHost('world.openfoodfacts.org', clean),
    searchByTextOnHost('world.openbeautyfacts.org', clean),
    searchByTextOnHost('world.openproductsfacts.org', clean),
  ]);

  return food ?? beauty ?? products;
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

  // Search product databases by text (used after OCR reads a label)
  searchByText: (query: string) => searchProductByText(query),

  async scanBarcode(barcode: string) {
    // 6 structured databases in parallel — first match wins. Coverage:
    //   • Open Food Facts        → food & beverages worldwide
    //   • UPC Item DB            → packaged goods, US + Asia
    //   • Open Beauty Facts      → cosmetics & personal care
    //   • Open Products Facts    → general consumer goods, electronics, toys
    //   • Open Pet Food Facts    → pet food and treats
    //   • Wikidata               → encyclopedic entries with EAN/UPC
    const [off, upc, obf, opf, opetf, wiki] = await Promise.all([
      tryOpenFoodFacts(barcode),
      tryUPCItemDB(barcode),
      tryOpenBeautyFacts(barcode),
      tryOpenProductsFacts(barcode),
      tryOpenPetFoodFacts(barcode),
      tryWikidata(barcode),
    ]);

    let result = off ?? upc ?? obf ?? opf ?? opetf ?? wiki;

    // Last resort: open-web search via CORS proxy. Slower and lower quality
    // than a database hit, but catches obscure local products that aren't
    // catalogued anywhere structured.
    if (!result) {
      result = await tryWebSearch(barcode);
    }

    if (!result) throw new Error('Product not found anywhere — even the open web');

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
      source: result.source,
    };
  },
};
