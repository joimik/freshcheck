import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import type { Stats as StatsT } from '../types';
import { api } from '../utils/api';
import { EmptyState } from '../components/EmptyState';

export function Stats() {
  const [data, setData] = useState<StatsT | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    api.stats().then((d) => {
      if (alive) {
        setData(d);
        setLoading(false);
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="space-y-3 pt-4">
        <div className="skeleton h-24 rounded-2xl" />
        <div className="skeleton h-48 rounded-2xl" />
      </div>
    );
  }

  if (!data || data.total_all === 0) {
    return (
      <EmptyState
        emoji="📊"
        title="No stats yet"
        hint="Once you add and use items, your savings will show up here."
      />
    );
  }

  const cells = [
    { label: 'Tracked', value: data.total_all, color: 'text-white' },
    { label: 'Saved',   value: data.saved,     color: 'text-fresh' },
    { label: 'Wasted',  value: data.expired,   color: 'text-danger' },
  ];

  return (
    <div className="space-y-4 pb-6">
      <header className="pt-2">
        <div className="text-xs uppercase tracking-wider text-gray-500">Your impact</div>
        <h1 className="text-2xl font-bold text-white">Stats</h1>
      </header>

      <div className="grid grid-cols-3 gap-2.5">
        {cells.map((c) => (
          <div key={c.label} className="card text-center">
            <div className={`text-2xl font-bold ${c.color}`}>{c.value}</div>
            <div className="text-xs text-gray-500 mt-0.5">{c.label}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="text-sm font-medium text-gray-300">Waste score</div>
        <div className="flex items-end gap-2 mt-1">
          <div className="text-3xl font-bold text-white">{data.waste_score}%</div>
          <div className="text-xs text-gray-500 mb-1.5">
            of finished items expired before use
          </div>
        </div>
        <div className="mt-2 h-2 bg-[#2a2a2a] rounded-full overflow-hidden">
          <div
            className={
              'h-full ' +
              (data.waste_score > 30
                ? 'bg-danger'
                : data.waste_score > 10
                  ? 'bg-warn'
                  : 'bg-fresh')
            }
            style={{ width: `${data.waste_score}%` }}
          />
        </div>
      </div>

      <div className="card">
        <div className="text-sm font-medium text-gray-300 mb-3">Items by week</div>
        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.by_week}>
              <XAxis dataKey="week" fontSize={10} tickLine={false} axisLine={false} tick={{ fill: '#6b7280' }} />
              <YAxis fontSize={10} tickLine={false} axisLine={false} allowDecimals={false} tick={{ fill: '#6b7280' }} />
              <Tooltip
                cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                contentStyle={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 12, color: '#f0f0f0' }}
              />
              <Bar dataKey="count" fill="#22C55E" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
