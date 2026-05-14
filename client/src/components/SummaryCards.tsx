import type { Item } from '../types';
import { daysUntil } from '../utils/dates';

export function SummaryCards({ items }: { items: Item[] }) {
  let urgent = 0;
  let fresh = 0;
  let expired = 0;
  for (const i of items) {
    const d = daysUntil(i.expiry_date);
    if (d < 0) expired++;
    else if (d <= 2) urgent++;
    else fresh++;
  }

  const cells: { label: string; value: number; bg: string; text: string }[] = [
    { label: 'Expiring soon', value: urgent, bg: 'bg-red-900/40',   text: 'text-danger' },
    { label: 'Fresh',         value: fresh,  bg: 'bg-green-900/40', text: 'text-fresh' },
    { label: 'Expired',       value: expired, bg: 'bg-[#242424]',   text: 'text-gray-400' },
  ];

  return (
    <div className="grid grid-cols-3 gap-2.5">
      {cells.map((c) => (
        <div key={c.label} className={`${c.bg} rounded-2xl p-3.5`}>
          <div className={`text-2xl font-bold ${c.text}`}>{c.value}</div>
          <div className="text-xs text-gray-500 mt-0.5">{c.label}</div>
        </div>
      ))}
    </div>
  );
}
