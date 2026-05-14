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

  const remove = async (id: number) => {
    await api.deleteItem(id);
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const markUsed = async (id: number) => {
    await api.updateItem(id, { status: 'used' });
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  return { items, loading, error, refresh, add, remove, markUsed };
}
