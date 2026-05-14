import { useCallback, useEffect, useState } from 'react';
import { api } from '../utils/api';
import type { Item, NewItem } from '../types';

export function useItems() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // First flip any past-date items to 'expired' so the streak math is honest
      await api.autoExpire();
      setItems(await api.listItems());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const add = async (item: NewItem) => {
    const created = await api.addItem(item);
    setItems((prev) =>
      [...prev, created].sort((a, b) => a.expiry_date.localeCompare(b.expiry_date))
    );
    return created;
  };

  const update = async (id: number, patch: Partial<Item>) => {
    const updated = await api.updateItem(id, patch);
    setItems((prev) =>
      prev
        .map((i) => (i.id === id ? updated : i))
        .sort((a, b) => a.expiry_date.localeCompare(b.expiry_date))
    );
    return updated;
  };

  const remove = async (id: number) => {
    await api.deleteItem(id);
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  // Decrement quantity; if it would hit 0, fully mark as used.
  const useOne = async (id: number) => {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    if (item.quantity > 1) {
      const updated = await api.updateItem(id, { quantity: item.quantity - 1 });
      setItems((prev) => prev.map((i) => (i.id === id ? updated : i)));
    } else {
      await api.updateItem(id, { status: 'used' });
      setItems((prev) => prev.filter((i) => i.id !== id));
    }
  };

  // Always mark fully as used (regardless of quantity)
  const markUsed = async (id: number) => {
    await api.updateItem(id, { status: 'used' });
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  return { items, loading, error, refresh, add, update, remove, useOne, markUsed };
}
