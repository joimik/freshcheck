import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, Bookmark, Download, Trash2, BookOpen, Crown, ChevronRight, Lock } from 'lucide-react';
import type { Category, Item } from '../types';
import { CATEGORY_META } from '../types';
import { loadSettings, saveSettings, type Settings as S } from '../utils/settings';
import { requestNotificationPermission } from '../utils/notifications';
import { useToast } from '../hooks/useToast';
import { usePremium } from '../utils/premium';

type Props = {
  items: Item[];
  onClearAll: () => Promise<void>;
};

export function Settings({ items, onClearAll }: Props) {
  const toast = useToast();
  const [settings, setSettings] = useState<S>(loadSettings());
  const premium = usePremium();

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
    if (!premium.isPremium) {
      toast('CSV export is a Premium feature', 'info');
      return;
    }
    if (!items.length) {
      toast('Nothing to export yet', 'info');
      return;
    }
    const header = ['id', 'product_name', 'category', 'expiry_date', 'quantity', 'notes', 'added_date', 'status', 'location', 'estimated_cost'];
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
    a.download = `shelflife-${new Date().toISOString().slice(0, 10)}.csv`;
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

      {/* Premium card — different look depending on tier */}
      {premium.isPremium ? (
        <Link
          to="/premium"
          className="card flex items-center gap-3 border border-amber-500/40 bg-gradient-to-br from-amber-900/20 to-[#1a1a1a]"
        >
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-400 to-yellow-600 flex items-center justify-center shadow-lg shadow-amber-500/20 shrink-0">
            <Crown size={20} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-white flex items-center gap-1.5">
              ShelfLife Premium
              <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded-full font-medium uppercase">
                {premium.tier}
              </span>
            </div>
            <div className="text-xs text-gray-500 mt-0.5">Manage your subscription</div>
          </div>
          <ChevronRight size={18} className="text-gray-500 shrink-0" />
        </Link>
      ) : (
        <Link
          to="/premium"
          className="card flex items-center gap-3 border border-amber-500/40 bg-gradient-to-br from-amber-900/20 to-[#1a1a1a] hover:from-amber-900/30 transition"
        >
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-400 to-yellow-600 flex items-center justify-center shadow-lg shadow-amber-500/20 shrink-0">
            <Crown size={20} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-white">Upgrade to Premium</div>
            <div className="text-xs text-gray-400 mt-0.5">Unlock CSV export, themes, and more</div>
          </div>
          <ChevronRight size={18} className="text-amber-400 shrink-0" />
        </Link>
      )}

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
        <button
          onClick={() => {
            localStorage.removeItem('shelflife.onboarded');
            location.reload();
          }}
          className="btn-ghost w-full justify-start"
        >
          <BookOpen size={18} /> Replay intro tutorial
        </button>
        <button
          onClick={exportCsv}
          className={'btn-ghost w-full justify-start ' + (premium.isPremium ? '' : 'opacity-75')}
        >
          {premium.isPremium ? <Download size={18} /> : <Lock size={16} />}
          Export inventory as CSV
          {!premium.isPremium && (
            <span className="ml-auto text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded-full font-medium uppercase">
              Premium
            </span>
          )}
        </button>
        <button onClick={clearAll} className="btn-ghost w-full justify-start text-danger hover:bg-red-900/30">
          <Trash2 size={18} /> Clear all data
        </button>
      </section>

      <p className="text-center text-xs text-gray-600 pt-2">
        ShelfLife v1.1 — made with 🥬 by Kenzo
      </p>
    </div>
  );
}
