import { useRef, useState } from 'react';
import { Trash2, Check, Pencil, Minus } from 'lucide-react';
import type { Item } from '../types';
import { CATEGORY_META, LOCATION_META } from '../types';
import { daysLabel, daysUntil, freshnessTier, tierStyles } from '../utils/dates';

type Props = {
  item: Item;
  onDelete: (id: number) => void;
  onUseOne: (id: number) => void;  // decrement quantity by 1, or mark used if quantity=1
  onEdit: (item: Item) => void;
};

const SWIPE_THRESHOLD = 80; // pixels to commit a swipe action

export function ItemCard({ item, onDelete, onUseOne, onEdit }: Props) {
  const days = daysUntil(item.expiry_date);
  const tier = freshnessTier(days);
  const styles = tierStyles(tier);
  const cat = CATEGORY_META[item.category] ?? CATEGORY_META.other;
  const loc = LOCATION_META[item.location] ?? LOCATION_META.fridge;

  const [dragX, setDragX] = useState(0);
  const startX = useRef<number | null>(null);
  const dragging = useRef(false);

  function handleTouchStart(e: React.TouchEvent) {
    startX.current = e.touches[0].clientX;
    dragging.current = true;
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (!dragging.current || startX.current === null) return;
    const dx = e.touches[0].clientX - startX.current;
    // Clamp so the card can't be dragged too far
    setDragX(Math.max(-160, Math.min(160, dx)));
  }

  function handleTouchEnd() {
    if (!dragging.current) return;
    dragging.current = false;
    if (dragX > SWIPE_THRESHOLD) {
      // Swipe right → use one
      onUseOne(item.id);
    } else if (dragX < -SWIPE_THRESHOLD) {
      // Swipe left → delete
      onDelete(item.id);
    }
    setDragX(0);
    startX.current = null;
  }

  // Background actions visible behind the card as it slides
  const showRightAction = dragX > 20;
  const showLeftAction = dragX < -20;

  return (
    <div className="relative overflow-hidden rounded-2xl">
      {/* Action backgrounds — visible behind the card while swiping */}
      <div className="absolute inset-0 flex">
        <div className={`flex-1 flex items-center pl-5 bg-fresh/20 transition-opacity ${showRightAction ? 'opacity-100' : 'opacity-0'}`}>
          <Check size={22} className="text-fresh" />
          <span className="ml-2 text-sm font-medium text-fresh">Use one</span>
        </div>
        <div className={`flex-1 flex items-center justify-end pr-5 bg-danger/20 transition-opacity ${showLeftAction ? 'opacity-100' : 'opacity-0'}`}>
          <span className="mr-2 text-sm font-medium text-danger">Delete</span>
          <Trash2 size={22} className="text-danger" />
        </div>
      </div>

      <div
        className={`card flex items-center gap-3 border-l-4 ${styles.accent} relative transition-transform`}
        style={{ transform: `translateX(${dragX}px)`, transition: dragging.current ? 'none' : 'transform 0.25s ease' }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {item.image_url ? (
          <img
            src={item.image_url}
            alt={item.product_name}
            className="w-12 h-12 rounded-2xl object-contain bg-white shrink-0 shadow-sm"
            onError={(e) => {
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
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className={`text-xs font-medium ${styles.text} ${styles.bg} px-2 py-0.5 rounded-full`}>
              {daysLabel(days)}
            </span>
            <span className="text-[10px] text-gray-500 inline-flex items-center gap-0.5">
              {loc.emoji} {loc.label}
            </span>
            <span className="text-xs text-gray-600">{item.expiry_date}</span>
          </div>
        </div>

        <div className="flex gap-0.5 shrink-0">
          <button
            onClick={() => onUseOne(item.id)}
            aria-label={item.quantity > 1 ? 'Use one' : 'Mark as used'}
            title={item.quantity > 1 ? 'Use one' : 'Mark as used'}
            className="p-2 rounded-lg text-gray-500 hover:bg-[#2a2a2a] hover:text-fresh active:scale-95 transition"
          >
            {item.quantity > 1 ? <Minus size={18} /> : <Check size={18} />}
          </button>
          <button
            onClick={() => onEdit(item)}
            aria-label="Edit item"
            className="p-2 rounded-lg text-gray-500 hover:bg-[#2a2a2a] hover:text-fresh active:scale-95 transition"
          >
            <Pencil size={16} />
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
    </div>
  );
}
