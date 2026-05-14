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
};

export type NewItem = {
  product_name: string;
  category: Category;
  expiry_date: string;
  quantity: number;
  notes?: string | null;
  barcode?: string | null;
  image_url?: string | null;
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
