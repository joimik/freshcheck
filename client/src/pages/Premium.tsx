import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Crown,
  Check,
  Sparkles,
  Cloud,
  Palette,
  FileText,
  Bot,
  BarChart3,
  Camera,
  ArrowLeft,
  Star,
} from 'lucide-react';
import { usePremium, setPremium, cancelPremium, type PremiumTier } from '../utils/premium';
import { useToast } from '../hooks/useToast';

type Plan = {
  id: PremiumTier;
  name: string;
  price_usd: string;
  price_idr: string;
  per: string;
  badge?: string;
  highlight?: boolean;
};

const PLANS: Plan[] = [
  { id: 'monthly',  name: 'Monthly',  price_usd: '$1.99',  price_idr: 'Rp 29.000',  per: '/month' },
  { id: 'yearly',   name: 'Yearly',   price_usd: '$14.99', price_idr: 'Rp 199.000', per: '/year',     badge: 'BEST VALUE', highlight: true },
  { id: 'lifetime', name: 'Lifetime', price_usd: '$29.99', price_idr: 'Rp 399.000', per: 'one-time' },
];

const FEATURES = [
  { icon: Camera,    title: 'Unlimited photo scans',  desc: 'Free users get 10/day. Premium has no cap.' },
  { icon: FileText,  title: 'Export to CSV',           desc: 'Download your full inventory anytime.' },
  { icon: BarChart3, title: 'Advanced analytics',      desc: 'Deeper waste insights, monthly trends, comparisons.' },
  { icon: Palette,   title: 'Custom themes',           desc: 'Light mode, OLED black, sepia, and more.' },
  { icon: Cloud,     title: 'Cloud backup & sync',     desc: 'Coming soon: sync items across all your devices.' },
  { icon: Bot,       title: 'AI fridge assistant',     desc: 'Coming soon: chat with your fridge for ideas + tips.' },
  { icon: Sparkles,  title: 'Supporter badge',         desc: 'A subtle gold crown next to your name.' },
  { icon: Star,      title: 'Priority support',        desc: 'Direct line to the dev when something breaks.' },
];

export function Premium() {
  const nav = useNavigate();
  const toast = useToast();
  const premium = usePremium();
  const [selected, setSelected] = useState<PremiumTier>('yearly');

  function handleSubscribe() {
    // TODO: Hook up RevenueCat / Stripe / Capacitor in-app purchase here.
    // For now, simulate the unlock so we can ship the UI first.
    setPremium(selected);
    toast(`Welcome to ShelfLife Premium! 👑`, 'success');
    setTimeout(() => nav('/'), 1200);
  }

  function handleCancel() {
    if (!confirm('Cancel Premium? You will lose access to all premium features.')) return;
    cancelPremium();
    toast('Premium cancelled', 'info');
  }

  // Already-premium view
  if (premium.isPremium) {
    return (
      <div className="space-y-4 pb-6">
        <header className="flex items-center gap-2 pt-2">
          <button onClick={() => nav(-1)} className="p-2 rounded-lg text-gray-400 hover:bg-[#1a1a1a]">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-2xl font-bold text-white">Premium</h1>
        </header>

        <div className="card text-center py-8 border border-amber-500/40 bg-gradient-to-br from-amber-900/20 to-[#1a1a1a]">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-amber-400 to-yellow-600 shadow-lg shadow-amber-500/30 mb-3">
            <Crown size={28} className="text-white" />
          </div>
          <div className="text-xl font-bold text-white">You're on Premium</div>
          <div className="text-sm text-gray-400 mt-1 capitalize">{premium.tier} plan</div>
          {premium.expires && (
            <div className="text-xs text-gray-500 mt-2">
              Renews on {new Date(premium.expires).toLocaleDateString()}
            </div>
          )}
          {premium.tier === 'lifetime' && (
            <div className="text-xs text-amber-400 mt-2">⭐ Forever access</div>
          )}
        </div>

        <section>
          <h2 className="text-sm font-semibold text-gray-300 mb-2">Premium perks active</h2>
          <div className="space-y-1.5">
            {FEATURES.map((f) => (
              <div key={f.title} className="flex items-center gap-3 bg-[#1a1a1a] rounded-xl p-3 border border-[#2a2a2a]">
                <f.icon size={18} className="text-amber-400 shrink-0" />
                <span className="text-sm text-gray-200">{f.title}</span>
                <Check size={16} className="ml-auto text-fresh shrink-0" />
              </div>
            ))}
          </div>
        </section>

        <button onClick={handleCancel} className="text-xs text-gray-500 hover:text-danger w-full pt-2">
          Cancel subscription
        </button>
      </div>
    );
  }

  // Upgrade view (free tier)
  return (
    <div className="space-y-4 pb-6">
      <header className="flex items-center gap-2 pt-2">
        <button onClick={() => nav(-1)} className="p-2 rounded-lg text-gray-400 hover:bg-[#1a1a1a]">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-bold text-white">Go Premium</h1>
      </header>

      {/* Hero */}
      <div className="card text-center py-7 border border-amber-500/30 bg-gradient-to-br from-amber-900/20 via-[#1a1a1a] to-[#1a1a1a]">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-amber-400 to-yellow-600 shadow-xl shadow-amber-500/30 mb-3">
          <Crown size={28} className="text-white" />
        </div>
        <div className="text-xl font-bold text-white">Unlock the full ShelfLife</div>
        <div className="text-sm text-gray-400 mt-1 max-w-xs mx-auto">
          Support a one-developer indie app and get every feature.
        </div>
      </div>

      {/* Plan selector */}
      <div className="space-y-2">
        {PLANS.map((p) => (
          <button
            key={p.id}
            onClick={() => setSelected(p.id)}
            className={
              'w-full text-left card transition relative ' +
              (selected === p.id
                ? 'border-fresh ring-2 ring-fresh/20'
                : 'border-[#2a2a2a]') +
              (p.highlight ? ' ' : '')
            }
          >
            {p.badge && (
              <div className="absolute -top-2 right-3 bg-fresh text-white text-[9px] font-bold px-2 py-0.5 rounded-full">
                {p.badge}
              </div>
            )}
            <div className="flex items-center gap-3">
              <div
                className={
                  'w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center ' +
                  (selected === p.id ? 'border-fresh bg-fresh' : 'border-gray-600')
                }
              >
                {selected === p.id && <div className="w-2 h-2 rounded-full bg-white" />}
              </div>
              <div className="flex-1">
                <div className="font-semibold text-white">{p.name}</div>
                <div className="text-xs text-gray-500">{p.price_idr} <span className="text-gray-600">· {p.price_usd}</span></div>
              </div>
              <div className="text-xs text-gray-400">{p.per}</div>
            </div>
          </button>
        ))}
      </div>

      <button onClick={handleSubscribe} className="btn-primary w-full text-base py-3.5">
        <Crown size={18} /> Subscribe — {PLANS.find((p) => p.id === selected)?.price_idr}
      </button>

      <p className="text-[11px] text-gray-600 text-center leading-relaxed">
        Cancel anytime. No auto-renew without your consent.<br />
        Subscription managed in this app.
      </p>

      {/* Feature list */}
      <section className="pt-2">
        <h2 className="text-sm font-semibold text-gray-300 mb-2">What you get</h2>
        <div className="space-y-2">
          {FEATURES.map((f) => (
            <div key={f.title} className="card flex items-start gap-3 py-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400/20 to-fresh/20 flex items-center justify-center shrink-0">
                <f.icon size={16} className="text-amber-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-white">{f.title}</div>
                <div className="text-xs text-gray-500 mt-0.5">{f.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Trust block */}
      <div className="card text-center text-xs text-gray-500 py-4">
        💯 No ads, ever. 🔒 No data sharing. 🌐 Cancel anytime.
      </div>
    </div>
  );
}
