export type Category =
  | 'meat'
  | 'dairy'
  | 'produce'
  | 'condiments'
  | 'canned'
  | 'snacks'
  | 'medicine'
  | 'other';

export type ItemStatus = 'active' | 'used' | 'expired';

export type Location = 'fridge' | 'freezer' | 'pantry';

export type Item = {
  id: number;
  product_name: string;
  category: Category;
  expiry_date: string; // YYYY-MM-DD
  quantity: number;
  notes: string | null;
  added_date: string;
  status: ItemStatus;
  barcode: string | null;
  image_url: string | null;
  location: Location;
  estimated_cost: number | null; // IDR Rupiah
};

export type NewItem = {
  product_name: string;
  category: Category;
  expiry_date: string;
  quantity: number;
  notes?: string | null;
  barcode?: string | null;
  image_url?: string | null;
  location?: Location;
  estimated_cost?: number | null;
};

export type Recipe = {
  name: string;
  prep_time: string;
  steps: string[];
  uses_ingredients: string[];
  all_ingredients: string[];
  thumbnail: string | null;
  source: string;
};

export type Stats = {
  total_all: number;
  total_active: number;
  saved: number;
  expired: number;
  waste_score: number;
  by_week: { week: string; count: number }[];
  wasted_cost: number; // total IDR of expired items
};

export type ShoppingItem = {
  id: number;
  name: string;
  category: Category;
  done: boolean;
  added_date: string;
};

export type ItemTemplate = {
  id: number;
  product_name: string;
  category: Category;
  default_quantity: number;
  default_shelf_life_days: number;
  image_url: string | null;
  use_count: number;
  last_used: string;
};

export type RecentBarcode = {
  barcode: string;
  product_name: string;
  category: Category;
  image_url: string | null;
  scanned_at: string;
};

export const CATEGORY_META: Record<Category, { emoji: string; label: string; icon: string }> = {
  meat:       { emoji: '🥩', label: 'Meat',        icon: '/icons/meat.png' },
  dairy:      { emoji: '🥛', label: 'Dairy',       icon: '/icons/dairy.png' },
  produce:    { emoji: '🥦', label: 'Produce',     icon: '/icons/produce.png' },
  condiments: { emoji: '🧴', label: 'Condiments',  icon: '/icons/condiments.png' },
  canned:     { emoji: '🥫', label: 'Canned',      icon: '/icons/canned.png' },
  snacks:     { emoji: '🧁', label: 'Snacks',      icon: '/icons/snacks.png' },
  medicine:   { emoji: '💊', label: 'Medicine',    icon: '/icons/medicine.png' },
  other:      { emoji: '📦', label: 'Other',       icon: '/icons/other.png' },
};

export const LOCATION_META: Record<Location, { emoji: string; label: string }> = {
  fridge:  { emoji: '🧊', label: 'Fridge' },
  freezer: { emoji: '❄️', label: 'Freezer' },
  pantry:  { emoji: '🥫', label: 'Pantry' },
};

// Static storage tips shown when a category is selected in the Add modal.
// Helps users set a realistic expiry date when they don't have one printed.
export const STORAGE_TIPS: Record<Category, string> = {
  meat:       'Raw meat: 1–2 days in fridge, up to 12 months in freezer. Cooked: 3–4 days.',
  dairy:      'Milk: 5–7 days after opening. Cheese: 1–3 weeks. Yogurt: check date + 1 week.',
  produce:    'Leafy greens: 3–5 days. Berries: 3–7 days. Most veggies: 1 week. Apples: 4–6 weeks.',
  condiments: 'Opened sauce: 1–6 months in fridge. Check the bottle for "best after opening" hint.',
  canned:     'Unopened: years (check date). Once opened, transfer to fridge — 3–4 days max.',
  snacks:     'Sealed: months. Opened crackers/chips: 1–2 weeks before going stale.',
  medicine:   'Always check the printed expiry. Some lose potency after the date — do not extend.',
  other:      'Check the packaging. When unsure, smell test + use within 3–5 days of opening.',
};
