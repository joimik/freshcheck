import { useEffect } from 'react';
import { ItemCard } from '../components/ItemCard';
import { SummaryCards } from '../components/SummaryCards';
import { EmptyState } from '../components/EmptyState';
import type { Item } from '../types';
import { loadSettings } from '../utils/settings';
import { notifyExpiringIfNeeded } from '../utils/notifications';
import { useToast } from '../hooks/useToast';

type Props = {
  items: Item[];
  loading: boolean;
  onDelete: (id: number) => Promise<void>;
  onUse: (id: number) => Promise<void>;
  onAdd: () => void;
};

export function Home({ items, loading, onDelete, onUse, onAdd }: Props) {
  const toast = useToast();

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
  async function safeUse(id: number) {
    try {
      await onUse(id);
      toast('Marked as used — nice save! 🎉', 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  return (
    <div className="space-y-4 pb-6">
      <header className="pt-2 flex items-center gap-3">
        <div className="w-14 h-14 rounded-2xl overflow-hidden bg-black shadow-md shrink-0">
          <img src="/icons/fridge.png" alt="Fridge" className="w-full h-full object-cover" />
        </div>
        <div>
          <div className="text-xs uppercase tracking-wider text-gray-500">Your fridge</div>
          <h1 className="text-2xl font-bold text-white">FreshCheck</h1>
        </div>
      </header>

      <SummaryCards items={items} />

      {loading ? (
        <div className="space-y-2.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-20 rounded-2xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          emoji="🥬"
          title="Your fridge is empty"
          hint="Add your first item to start tracking expiry dates."
          action={{ label: 'Add an item', onClick: onAdd }}
        />
      ) : (
        <div className="space-y-2.5">
          {items.map((i) => (
            <ItemCard key={i.id} item={i} onDelete={safeDelete} onUse={safeUse} />
          ))}
        </div>
      )}
    </div>
  );
}
