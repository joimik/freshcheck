import { useEffect, useMemo, useState } from 'react';
import { Search, ArrowUpDown, WifiOff, Crown } from 'lucide-react';
import { usePremium } from '../utils/premium';
import { ItemCard } from '../components/ItemCard';
import { SummaryCards } from '../components/SummaryCards';
import { EmptyState } from '../components/EmptyState';
import type { Category, Item, Location } from '../types';
import { CATEGORY_META, LOCATION_META } from '../types';
import { loadSettings } from '../utils/settings';
import { notifyExpiringIfNeeded } from '../utils/notifications';
import { useToast } from '../hooks/useToast';
import { daysUntil } from '../utils/dates';

type SortMode = 'expiry' | 'name' | 'category' | 'added';

type Props = {
  items: Item[];
  loading: boolean;
  onDelete: (id: number) => Promise<void>;
  onUseOne: (id: number) => Promise<void>;
  onEdit: (item: Item) => void;
  onAdd: () => void;
};

export function Home({ items, loading, onDelete, onUseOne, onEdit, onAdd }: Props) {
  const toast = useToast();
  const premium = usePremium();
  const [location, setLocation] = useState<Location | 'all'>('all');
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState<Category | 'all'>('all');
  const [sort, setSort] = useState<SortMode>('expiry');
  const [online, setOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);

  useEffect(() => {
    function up() { setOnline(true); }
    function down() { setOnline(false); }
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  useEffect(() => {
    if (loading) return;
    const s = loadSettings();
    if (s.notificationsEnabled) notifyExpiringIfNeeded(items, s.alertDays);
  }, [items, loading]);

  async function safeDelete(id: number) {
    try {
      await onDelete(id);
      toast('Item deleted', 'info');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  async function safeUseOne(id: number) {
    const item = items.find((i) => i.id === id);
    try {
      await onUseOne(id);
      if (item && item.quantity > 1) {
        toast(`Used one — ${item.quantity - 1} left`, 'success');
      } else {
        toast('Marked as used — nice save! 🎉', 'success');
      }
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  const filtered = useMemo(() => {
    let result = items;
    if (location !== 'all') result = result.filter((i) => i.location === location);
    if (filterCat !== 'all') result = result.filter((i) => i.category === filterCat);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((i) =>
        i.product_name.toLowerCase().includes(q) ||
        (i.notes ?? '').toLowerCase().includes(q)
      );
    }
    const sorted = [...result];
    switch (sort) {
      case 'expiry': sorted.sort((a, b) => a.expiry_date.localeCompare(b.expiry_date)); break;
      case 'name': sorted.sort((a, b) => a.product_name.localeCompare(b.product_name)); break;
      case 'category': sorted.sort((a, b) => a.category.localeCompare(b.category) || daysUntil(a.expiry_date) - daysUntil(b.expiry_date)); break;
      case 'added': sorted.sort((a, b) => b.added_date.localeCompare(a.added_date)); break;
    }
    return sorted;
  }, [items, location, filterCat, search, sort]);

  const locationCounts = useMemo(() => {
    const c: Record<Location | 'all', number> = { all: items.length, fridge: 0, freezer: 0, pantry: 0 };
    for (const i of items) c[i.location] = (c[i.location] ?? 0) + 1;
    return c;
  }, [items]);

  return (
    <div className="space-y-4 pb-6">
      <header className="pt-2 flex items-center gap-3">
        <div className="w-14 h-14 rounded-2xl overflow-hidden bg-black shadow-md shrink-0">
          <img src="/icons/fridge.png" alt="Fridge" className="w-full h-full object-cover" />
        </div>
        <div className="flex-1">
          <div className="text-xs uppercase tracking-wider text-gray-500">Your kitchen</div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-1.5">
            FreshCheck
            {premium.isPremium && (
              <Crown size={16} className="text-amber-400" aria-label="Premium" />
            )}
          </h1>
        </div>
      </header>

      {!online && (
        <div className="flex items-center gap-2 bg-amber-900/30 border border-amber-900/50 rounded-xl px-3 py-2 text-xs text-warn">
          <WifiOff size={14} />
          You're offline — your items still work, but barcode lookup needs internet.
        </div>
      )}

      <SummaryCards items={items} />

      {/* Location tabs */}
      <div className="grid grid-cols-4 gap-1.5 bg-[#1a1a1a] p-1 rounded-xl text-sm border border-[#2a2a2a]">
        {(['all', 'fridge', 'freezer', 'pantry'] as const).map((loc) => (
          <button
            key={loc}
            onClick={() => setLocation(loc)}
            className={
              'flex items-center justify-center gap-1 py-2 rounded-lg transition text-xs ' +
              (location === loc ? 'bg-[#333] text-white font-medium' : 'text-gray-500')
            }
          >
            {loc === 'all' ? 'All' : LOCATION_META[loc].emoji + ' ' + LOCATION_META[loc].label}
            <span className="text-[10px] text-gray-600">({locationCounts[loc]})</span>
          </button>
        ))}
      </div>

      {/* Search + sort */}
      {items.length > 3 && (
        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
            <input
              type="text"
              placeholder="Search items..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-[#333] bg-[#242424] text-sm text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-fresh"
            />
          </div>
          <div className="relative">
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortMode)}
              className="appearance-none pl-8 pr-3 py-2 rounded-xl border border-[#333] bg-[#242424] text-sm text-gray-200 focus:outline-none focus:border-fresh cursor-pointer"
            >
              <option value="expiry">Expiry</option>
              <option value="name">Name</option>
              <option value="category">Category</option>
              <option value="added">Recently added</option>
            </select>
            <ArrowUpDown size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-600 pointer-events-none" />
          </div>
        </div>
      )}

      {/* Category filter chips */}
      {items.length > 5 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
          <button
            onClick={() => setFilterCat('all')}
            className={
              'shrink-0 px-3 py-1 rounded-full text-xs border transition ' +
              (filterCat === 'all'
                ? 'border-fresh bg-green-900/40 text-fresh'
                : 'border-[#333] text-gray-500')
            }
          >
            All categories
          </button>
          {(Object.keys(CATEGORY_META) as Category[]).map((c) => (
            <button
              key={c}
              onClick={() => setFilterCat(c)}
              className={
                'shrink-0 px-3 py-1 rounded-full text-xs border transition ' +
                (filterCat === c
                  ? 'border-fresh bg-green-900/40 text-fresh'
                  : 'border-[#333] text-gray-500')
              }
            >
              {CATEGORY_META[c].emoji} {CATEGORY_META[c].label}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="space-y-2.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-20 rounded-2xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        items.length === 0 ? (
          <EmptyState
            emoji="🥬"
            title="Your fridge is empty"
            hint="Add your first item to start tracking expiry dates."
            action={{ label: 'Add an item', onClick: onAdd }}
          />
        ) : (
          <EmptyState
            emoji="🔍"
            title="No matches"
            hint="Try a different search or category filter."
          />
        )
      ) : (
        <div className="space-y-2.5">
          {filtered.map((i) => (
            <ItemCard
              key={i.id}
              item={i}
              onDelete={safeDelete}
              onUseOne={safeUseOne}
              onEdit={onEdit}
            />
          ))}
        </div>
      )}
    </div>
  );
}
