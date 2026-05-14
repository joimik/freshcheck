import { Trash2, Check } from 'lucide-react';
import type { Item } from '../types';
import { CATEGORY_META } from '../types';
import { daysLabel, daysUntil, freshnessTier, tierStyles } from '../utils/dates';

type Props = {
  item: Item;
  onDelete: (id: number) => void;
  onUse: (id: number) => void;
};

export function ItemCard({ item, onDelete, onUse }: Props) {
  const days = daysUntil(item.expiry_date);
  const tier = freshnessTier(days);
  const styles = tierStyles(tier);
  const cat = CATEGORY_META[item.category] ?? CATEGORY_META.other;

  return (
    <div className={`card flex items-center gap-3 border-l-4 ${styles.accent}`}>
      {item.image_url ? (
        <img
          src={item.image_url}
          alt={item.product_name}
          className="w-12 h-12 rounded-2xl object-contain bg-white shrink-0 shadow-sm"
          onError={(e) => {
            // If the product image fails to load, swap in the category icon
            const el = e.currentTarget as HTMLImageElement;
            el.src = cat.icon;
            el.className = 'w-12 h-12 rounded-2xl object-cover shrink-0 shadow-sm';
          }}
        />
      ) : (
        <div className="w-12 h-12 rounded-2xl overflow-hidden bg-black shrink-0 shadow-sm">
          <img src={cat.icon} alt={cat.label} className="w-full h-full object-cover" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-white truncate">{item.product_name}</h3>
          {item.quantity > 1 && (
            <span className="text-xs text-gray-500 shrink-0">×{item.quantity}</span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className={`text-xs font-medium ${styles.text} ${styles.bg} px-2 py-0.5 rounded-full`}>
            {daysLabel(days)}
          </span>
          <span className="text-xs text-gray-600">{item.expiry_date}</span>
        </div>
      </div>
      <div className="flex gap-1 shrink-0">
        <button
          onClick={() => onUse(item.id)}
          aria-label="Mark as used"
          className="p-2 rounded-lg text-gray-500 hover:bg-[#2a2a2a] hover:text-fresh active:scale-95 transition"
        >
          <Check size={18} />
        </button>
        <button
          onClick={() => onDelete(item.id)}
          aria-label="Delete item"
          className="p-2 rounded-lg text-gray-600 hover:bg-red-900/30 hover:text-danger active:scale-95 transition"
        >
          <Trash2 size={18} />
        </button>
      </div>
    </div>
  );
}
