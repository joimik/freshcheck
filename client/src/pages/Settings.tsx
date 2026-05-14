import { useState } from 'react';
import { Bell, Bookmark, Download, Trash2 } from 'lucide-react';
import type { Category, Item } from '../types';
import { CATEGORY_META } from '../types';
import { loadSettings, saveSettings, type Settings as S } from '../utils/settings';
import { requestNotificationPermission } from '../utils/notifications';
import { useToast } from '../hooks/useToast';

type Props = {
  items: Item[];
  onClearAll: () => Promise<void>;
};

export function Settings({ items, onClearAll }: Props) {
  const toast = useToast();
  const [settings, setSettings] = useState<S>(loadSettings());

  function update<K extends keyof S>(key: K, value: S[K]) {
    const next = { ...settings, [key]: value };
    setSettings(next);
    saveSettings(next);
  }

  async function toggleNotifications(enabled: boolean) {
    if (enabled) {
      const perm = await requestNotificationPermission();
      if (perm !== 'granted') {
        toast('Notification permission denied', 'error');
        return;
      }
      toast('Notifications enabled', 'success');
    }
    update('notificationsEnabled', enabled);
  }

  function exportCsv() {
    if (!items.length) {
      toast('Nothing to export yet', 'info');
      return;
    }
    const header = ['id', 'product_name', 'category', 'expiry_date', 'quantity', 'notes', 'added_date', 'status'];
    const rows = items.map((i) =>
      header
        .map((h) => {
          const v = (i as unknown as Record<string, unknown>)[h];
          const s = v == null ? '' : String(v);
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(',')
    );
    const blob = new Blob([header.join(',') + '\n' + rows.join('\n')], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `freshcheck-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast('CSV exported', 'success');
  }

  async function clearAll() {
    if (!confirm('Delete every item in your fridge? This cannot be undone.')) return;
    await onClearAll();
    toast('All items cleared', 'success');
  }

  return (
    <div className="space-y-4 pb-6">
      <header className="pt-2">
        <div className="text-xs uppercase tracking-wider text-gray-500">Preferences</div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
      </header>

      <section className="card">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Bell size={18} className="text-gray-400" />
            <div>
              <div className="font-medium text-gray-200">Notifications</div>
              <div className="text-xs text-gray-500">Alert before items expire</div>
            </div>
          </div>
          <input
            type="checkbox"
            checked={settings.notificationsEnabled}
            onChange={(e) => toggleNotifications(e.target.checked)}
            className="w-5 h-5 accent-fresh"
          />
        </div>
        {settings.notificationsEnabled && (
          <div className="mt-3 pt-3 border-t border-[#2a2a2a]">
            <div className="label">Alert me</div>
            <div className="grid grid-cols-3 gap-1.5">
              {[1, 2, 3].map((d) => (
                <button
                  key={d}
                  onClick={() => update('alertDays', d as 1 | 2 | 3)}
                  className={
                    'py-2 rounded-lg text-sm border transition ' +
                    (settings.alertDays === d
                      ? 'border-fresh bg-green-900/40 text-fresh font-medium'
                      : 'border-[#333] text-gray-400')
                  }
                >
                  {d} day{d > 1 ? 's' : ''} before
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="card">
        <div className="flex items-center gap-3 mb-2">
          <Bookmark size={18} className="text-gray-400" />
          <div>
            <div className="font-medium text-gray-200">Default category</div>
            <div className="text-xs text-gray-500">Used when adding new items</div>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-1.5 mt-2">
          {(Object.keys(CATEGORY_META) as Category[]).map((c) => (
            <button
              key={c}
              onClick={() => update('defaultCategory', c)}
              className={
                'flex flex-col items-center gap-1 py-2 rounded-lg border transition ' +
                (settings.defaultCategory === c
                  ? 'border-fresh bg-green-900/40'
                  : 'border-[#333] hover:bg-[#242424]')
              }
            >
              <div className="w-9 h-9 rounded-xl overflow-hidden bg-black shadow-sm">
                <img src={CATEGORY_META[c].icon} alt={CATEGORY_META[c].label} className="w-full h-full object-cover" />
              </div>
              <span className="text-[10px] text-gray-400">{CATEGORY_META[c].label}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="card space-y-2">
        <button onClick={exportCsv} className="btn-ghost w-full justify-start">
          <Download size={18} /> Export inventory as CSV
        </button>
        <button onClick={clearAll} className="btn-ghost w-full justify-start text-danger hover:bg-red-900/30">
          <Trash2 size={18} /> Clear all data
        </button>
      </section>

      <p className="text-center text-xs text-gray-600 pt-2">
        FreshCheck v1.0 — no API keys required.
      </p>
    </div>
  );
}
