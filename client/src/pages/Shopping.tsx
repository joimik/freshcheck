import { useEffect, useState } from 'react';
import { Plus, Trash2, Check, ShoppingBag, X } from 'lucide-react';
import type { Category, ShoppingItem } from '../types';
import { CATEGORY_META } from '../types';
import { api } from '../utils/api';
import { EmptyState } from '../components/EmptyState';
import { useToast } from '../hooks/useToast';

export function Shopping() {
  const toast = useToast();
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<Category>('produce');

  async function refresh() {
    setItems(await api.listShopping());
    setLoading(false);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function addItem(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await api.addShoppingItem({ name: name.trim(), category });
    setName('');
    refresh();
    toast('Added to shopping list', 'success');
  }

  async function toggle(id: number) {
    await api.toggleShoppingItem(id);
    refresh();
  }

  async function remove(id: number) {
    await api.deleteShoppingItem(id);
    refresh();
  }

  async function clearDone() {
    await api.clearDoneShopping();
    refresh();
    toast('Cleared checked items', 'success');
  }

  const pending = items.filter((i) => !i.done);
  const done = items.filter((i) => i.done);

  return (
    <div className="space-y-4 pb-6">
      <header className="pt-2 flex items-center gap-3">
        <div className="w-14 h-14 rounded-2xl bg-fresh/20 flex items-center justify-center shrink-0">
          <ShoppingBag size={26} className="text-fresh" />
        </div>
        <div>
          <div className="text-xs uppercase tracking-wider text-gray-500">Time to buy</div>
          <h1 className="text-2xl font-bold text-white">Shopping</h1>
        </div>
      </header>

      <form onSubmit={addItem} className="card space-y-3">
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Add to list..."
            className="input flex-1"
          />
          <button type="submit" disabled={!name.trim()} className="btn-primary px-3 disabled:opacity-50">
            <Plus size={18} />
          </button>
        </div>
        <div className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1">
          {(Object.keys(CATEGORY_META) as Category[]).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={
                'shrink-0 px-2.5 py-1 rounded-full text-xs border transition ' +
                (category === c
                  ? 'border-fresh bg-green-900/40 text-fresh'
                  : 'border-[#333] text-gray-500')
              }
            >
              {CATEGORY_META[c].emoji} {CATEGORY_META[c].label}
            </button>
          ))}
        </div>
      </form>

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => <div key={i} className="skeleton h-14 rounded-xl" />)}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          emoji="🛒"
          title="Nothing on the list"
          hint="Add things you need to buy next time."
        />
      ) : (
        <>
          {pending.length > 0 && (
            <section>
              <h2 className="text-xs text-gray-500 uppercase tracking-wider mb-2">To buy ({pending.length})</h2>
              <div className="space-y-1.5">
                {pending.map((it) => (
                  <Row key={it.id} item={it} onToggle={toggle} onRemove={remove} />
                ))}
              </div>
            </section>
          )}

          {done.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-xs text-gray-500 uppercase tracking-wider">Bought ({done.length})</h2>
                <button onClick={clearDone} className="text-xs text-gray-500 hover:text-danger">
                  Clear bought
                </button>
              </div>
              <div className="space-y-1.5 opacity-60">
                {done.map((it) => (
                  <Row key={it.id} item={it} onToggle={toggle} onRemove={remove} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Row({ item, onToggle, onRemove }: { item: ShoppingItem; onToggle: (id: number) => void; onRemove: (id: number) => void }) {
  const cat = CATEGORY_META[item.category];
  return (
    <div className="card flex items-center gap-3 py-2.5">
      <button
        onClick={() => onToggle(item.id)}
        className={
          'w-6 h-6 rounded-full border-2 shrink-0 flex items-center justify-center transition ' +
          (item.done ? 'bg-fresh border-fresh' : 'border-gray-600')
        }
      >
        {item.done && <Check size={14} className="text-white" />}
      </button>
      <div className="w-8 h-8 rounded-lg bg-black overflow-hidden shrink-0">
        <img src={cat.icon} alt="" className="w-full h-full object-cover" />
      </div>
      <div className={'flex-1 text-sm ' + (item.done ? 'line-through text-gray-500' : 'text-gray-100')}>
        {item.name}
      </div>
      <button onClick={() => onRemove(item.id)} className="p-1.5 rounded-lg text-gray-600 hover:text-danger hover:bg-red-900/30 transition">
        <X size={16} />
      </button>
    </div>
  );
}
