// Premium subscription state. For now, persistence is local-only —
// when we wire in real payments via RevenueCat or Stripe, this becomes
// the single source of truth that the rest of the app reads from.

import { useCallback, useEffect, useState } from 'react';

const PREMIUM_KEY = 'freshcheck.premium';
const PREMIUM_EXPIRES_KEY = 'freshcheck.premium_expires';

export type PremiumTier = 'free' | 'monthly' | 'yearly' | 'lifetime';

type PremiumState = {
  tier: PremiumTier;
  expires: string | null; // ISO date, null = lifetime or free
};

function read(): PremiumState {
  try {
    const tier = (localStorage.getItem(PREMIUM_KEY) as PremiumTier) || 'free';
    const expires = localStorage.getItem(PREMIUM_EXPIRES_KEY);

    // Auto-expire monthly/yearly subscriptions whose date has passed
    if (expires && (tier === 'monthly' || tier === 'yearly')) {
      if (new Date(expires) < new Date()) {
        localStorage.removeItem(PREMIUM_KEY);
        localStorage.removeItem(PREMIUM_EXPIRES_KEY);
        return { tier: 'free', expires: null };
      }
    }
    return { tier, expires };
  } catch {
    return { tier: 'free', expires: null };
  }
}

export function isPremium(): boolean {
  return read().tier !== 'free';
}

export function getPremiumState(): PremiumState {
  return read();
}

export function setPremium(tier: PremiumTier): void {
  localStorage.setItem(PREMIUM_KEY, tier);
  if (tier === 'monthly') {
    const expires = new Date();
    expires.setMonth(expires.getMonth() + 1);
    localStorage.setItem(PREMIUM_EXPIRES_KEY, expires.toISOString());
  } else if (tier === 'yearly') {
    const expires = new Date();
    expires.setFullYear(expires.getFullYear() + 1);
    localStorage.setItem(PREMIUM_EXPIRES_KEY, expires.toISOString());
  } else if (tier === 'lifetime') {
    localStorage.removeItem(PREMIUM_EXPIRES_KEY);
  } else {
    localStorage.removeItem(PREMIUM_EXPIRES_KEY);
  }
  // Fire a custom event so other components react immediately
  window.dispatchEvent(new CustomEvent('freshcheck:premium-changed'));
}

export function cancelPremium(): void {
  localStorage.removeItem(PREMIUM_KEY);
  localStorage.removeItem(PREMIUM_EXPIRES_KEY);
  window.dispatchEvent(new CustomEvent('freshcheck:premium-changed'));
}

export function usePremium() {
  const [state, setState] = useState<PremiumState>(read);

  const refresh = useCallback(() => setState(read()), []);

  useEffect(() => {
    const handler = () => refresh();
    window.addEventListener('freshcheck:premium-changed', handler);
    window.addEventListener('storage', handler);
    return () => {
      window.removeEventListener('freshcheck:premium-changed', handler);
      window.removeEventListener('storage', handler);
    };
  }, [refresh]);

  return {
    ...state,
    isPremium: state.tier !== 'free',
    refresh,
  };
}

// Feature flags — what's free vs premium. Easy to tune later.
export const PREMIUM_FEATURES = {
  csvExport: true,         // Premium-only
  customThemes: true,      // Premium-only (future)
  cloudSync: true,         // Premium-only (future)
  unlimitedPhotos: true,   // Premium-only (future rate limit)
  aiAssistant: true,       // Premium-only (future)
  advancedStats: true,     // Premium-only (extra cards)
} as const;
