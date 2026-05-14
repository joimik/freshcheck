import { useEffect, useState } from 'react';
import { Flame, Leaf, Wallet, Trophy, Share2, Lock } from 'lucide-react';
import type { Stats } from '../types';
import { api } from '../utils/api';
import { useToast } from '../hooks/useToast';

type Achievement = {
  id: string;
  emoji: string;
  title: string;
  hint: string;
  unlocked: (s: Stats) => boolean;
  progress?: (s: Stats) => { current: number; goal: number };
};

const ACHIEVEMENTS: Achievement[] = [
  {
    id: 'first_save',
    emoji: '🎉',
    title: 'First Save',
    hint: 'Mark your first item as used',
    unlocked: (s) => s.saved >= 1,
    progress: (s) => ({ current: Math.min(s.saved, 1), goal: 1 }),
  },
  {
    id: 'streak_3',
    emoji: '🔥',
    title: '3-Day Streak',
    hint: 'Three days waste-free in a row',
    unlocked: (s) => s.streak >= 3,
    progress: (s) => ({ current: Math.min(s.streak, 3), goal: 3 }),
  },
  {
    id: 'streak_7',
    emoji: '🌟',
    title: 'Week Warrior',
    hint: 'Seven days without wasting anything',
    unlocked: (s) => s.streak >= 7,
    progress: (s) => ({ current: Math.min(s.streak, 7), goal: 7 }),
  },
  {
    id: 'streak_30',
    emoji: '🏆',
    title: 'Month Master',
    hint: 'A full month, zero waste',
    unlocked: (s) => s.streak >= 30,
    progress: (s) => ({ current: Math.min(s.streak, 30), goal: 30 }),
  },
  {
    id: 'streak_90',
    emoji: '💎',
    title: 'Quarter King',
    hint: '90 days. Elite tier.',
    unlocked: (s) => s.streak >= 90,
    progress: (s) => ({ current: Math.min(s.streak, 90), goal: 90 }),
  },
  {
    id: 'money_100k',
    emoji: '💰',
    title: 'Smart Saver',
    hint: 'Rp 100.000 saved from waste',
    unlocked: (s) => s.saved_money >= 100_000,
    progress: (s) => ({ current: Math.min(s.saved_money, 100_000), goal: 100_000 }),
  },
  {
    id: 'money_500k',
    emoji: '💸',
    title: 'Half a Million',
    hint: 'Rp 500.000 saved — a real dent',
    unlocked: (s) => s.saved_money >= 500_000,
    progress: (s) => ({ current: Math.min(s.saved_money, 500_000), goal: 500_000 }),
  },
  {
    id: 'co2_10',
    emoji: '🌱',
    title: 'Eco Friendly',
    hint: '10 kg of CO₂ saved from waste',
    unlocked: (s) => s.saved_co2 >= 10,
    progress: (s) => ({ current: Math.min(s.saved_co2, 10), goal: 10 }),
  },
  {
    id: 'co2_50',
    emoji: '🌍',
    title: 'Earth Hero',
    hint: '50 kg of CO₂ saved — that\'s real impact',
    unlocked: (s) => s.saved_co2 >= 50,
    progress: (s) => ({ current: Math.min(s.saved_co2, 50), goal: 50 }),
  },
  {
    id: 'century',
    emoji: '💯',
    title: 'Century Club',
    hint: '100 items saved before expiry',
    unlocked: (s) => s.saved >= 100,
    progress: (s) => ({ current: Math.min(s.saved, 100), goal: 100 }),
  },
];

export function Streak() {
  const toast = useToast();
  const [data, setData] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    api.stats().then((d) => {
      if (alive) {
        setData(d);
        setLoading(false);
      }
    });
    return () => { alive = false; };
  }, []);

  if (loading) {
    return (
      <div className="space-y-3 pt-4">
        <div className="skeleton h-40 rounded-2xl" />
        <div className="skeleton h-32 rounded-2xl" />
        <div className="skeleton h-48 rounded-2xl" />
      </div>
    );
  }

  if (!data) return null;

  const unlockedCount = ACHIEVEMENTS.filter((a) => a.unlocked(data)).length;

  async function share() {
    const txt = `🔥 ${data!.streak}-day waste-free streak on ShelfLife!\n` +
      `💰 Saved Rp ${data!.saved_money.toLocaleString('id-ID')}\n` +
      `🌍 ${data!.saved_co2.toFixed(1)} kg of CO₂ kept out of the trash\n` +
      `🏆 ${unlockedCount}/${ACHIEVEMENTS.length} achievements unlocked\n\n` +
      `Stop wasting food → myshelflife.vercel.app`;

    // Use the native share sheet on mobile, fall back to clipboard on desktop
    if (navigator.share) {
      try {
        await navigator.share({ title: 'My ShelfLife streak 🔥', text: txt });
      } catch { /* user cancelled */ }
    } else {
      try {
        await navigator.clipboard.writeText(txt);
        toast('Copied to clipboard!', 'success');
      } catch {
        toast('Could not copy', 'error');
      }
    }
  }

  // Streak ring colours scale up with streak length to make it feel earned
  const ringClass = data.streak === 0
    ? 'from-gray-700 to-gray-800'
    : data.streak < 7
    ? 'from-orange-500 to-red-500'
    : data.streak < 30
    ? 'from-amber-400 to-orange-500'
    : data.streak < 90
    ? 'from-yellow-300 to-amber-500'
    : 'from-fresh via-emerald-400 to-cyan-400';

  return (
    <div className="space-y-4 pb-6">
      <header className="pt-2 flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-wider text-gray-500">Anti-waste</div>
          <h1 className="text-2xl font-bold text-white">Streak</h1>
        </div>
        <button
          onClick={share}
          className="inline-flex items-center gap-1.5 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-3 py-2 text-sm text-gray-300 hover:bg-[#242424] transition"
        >
          <Share2 size={15} /> Share
        </button>
      </header>

      {/* Streak hero ring */}
      <div className="card text-center py-8">
        <div className={`relative inline-flex items-center justify-center w-40 h-40 rounded-full bg-gradient-to-br ${ringClass} shadow-2xl`}>
          <div className="absolute inset-2 rounded-full bg-[#1a1a1a] flex flex-col items-center justify-center">
            <Flame size={28} className={data.streak === 0 ? 'text-gray-500' : 'text-orange-400'} />
            <div className="text-5xl font-bold text-white mt-1 leading-none">{data.streak}</div>
            <div className="text-[10px] text-gray-500 uppercase tracking-wider mt-1">
              {data.streak === 1 ? 'day' : 'days'}
            </div>
          </div>
        </div>
        <div className="mt-5 text-base font-medium text-gray-200">
          {data.streak === 0 && data.streak_broken_today
            ? 'Streak broke today — tomorrow is a new start 💪'
            : data.streak === 0
            ? 'Start your streak — keep food from expiring'
            : data.streak < 7
            ? 'Keep it going! 🔥'
            : data.streak < 30
            ? 'Crushing it!'
            : 'Legendary 💎'}
        </div>
        {data.streak > 0 && (
          <div className="text-xs text-gray-500 mt-1">
            {data.streak === 1 ? '1 day' : `${data.streak} days`} since anything expired
          </div>
        )}
      </div>

      {/* Impact stats */}
      <div className="grid grid-cols-2 gap-2.5">
        <ImpactCard
          icon={<Wallet size={18} className="text-fresh" />}
          label="Money saved"
          value={`Rp ${data.saved_money.toLocaleString('id-ID')}`}
          hint={data.saved_money === 0 ? 'Add cost to items to track' : `${data.saved} item${data.saved !== 1 ? 's' : ''} used in time`}
        />
        <ImpactCard
          icon={<Leaf size={18} className="text-fresh" />}
          label="CO₂ saved"
          value={`${data.saved_co2.toFixed(1)} kg`}
          hint={data.saved_co2 > 0 ? `≈ ${(data.saved_co2 * 4).toFixed(0)} km not driven` : 'Save some food to count'}
        />
      </div>

      {/* Achievements */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Trophy size={16} className="text-amber-400" />
            <h2 className="text-sm font-semibold text-gray-200">Achievements</h2>
          </div>
          <div className="text-xs text-gray-500">{unlockedCount} / {ACHIEVEMENTS.length}</div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {ACHIEVEMENTS.map((a) => {
            const unlocked = a.unlocked(data);
            const prog = a.progress?.(data);
            return (
              <div
                key={a.id}
                className={
                  'card relative overflow-hidden ' +
                  (unlocked
                    ? 'border-fresh/40 bg-gradient-to-br from-green-900/30 to-[#1a1a1a]'
                    : 'opacity-70')
                }
              >
                <div className="flex items-start gap-2">
                  <div className={'text-2xl shrink-0 ' + (unlocked ? '' : 'grayscale opacity-50')}>
                    {a.emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <div className="text-xs font-semibold text-white truncate">{a.title}</div>
                      {!unlocked && <Lock size={10} className="text-gray-600 shrink-0" />}
                    </div>
                    <div className="text-[10px] text-gray-500 leading-tight mt-0.5">{a.hint}</div>
                  </div>
                </div>
                {prog && !unlocked && (
                  <div className="mt-2 h-1 bg-[#2a2a2a] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-fresh/60"
                      style={{ width: `${Math.round((prog.current / prog.goal) * 100)}%` }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Honest footer */}
      <p className="text-center text-[11px] text-gray-600 pt-2">
        CO₂ estimates use category averages from food-waste research.<br />
        Add a price when scanning to track money saved.
      </p>
    </div>
  );
}

function ImpactCard({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint: string }) {
  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <div className="text-xs text-gray-500">{label}</div>
      </div>
      <div className="text-xl font-bold text-white">{value}</div>
      <div className="text-[10px] text-gray-600 mt-0.5">{hint}</div>
    </div>
  );
}
