export function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + 'T00:00:00');
  const diffMs = target.getTime() - today.getTime();
  return Math.round(diffMs / 86_400_000);
}

export function freshnessTier(days: number): 'expired' | 'urgent' | 'soon' | 'fresh' {
  if (days < 0) return 'expired';
  if (days <= 2) return 'urgent';
  if (days <= 7) return 'soon';
  return 'fresh';
}

export function tierStyles(tier: ReturnType<typeof freshnessTier>) {
  switch (tier) {
    case 'expired':
      return { bg: 'bg-[#242424]', text: 'text-gray-400', accent: 'border-gray-600' };
    case 'urgent':
      return { bg: 'bg-red-900/40', text: 'text-danger', accent: 'border-danger/50' };
    case 'soon':
      return { bg: 'bg-amber-900/40', text: 'text-warn', accent: 'border-warn/50' };
    case 'fresh':
      return { bg: 'bg-green-900/40', text: 'text-fresh', accent: 'border-fresh/50' };
  }
}

export function daysLabel(days: number): string {
  if (days < 0) return `Expired ${Math.abs(days)}d ago`;
  if (days === 0) return 'Expires today';
  if (days === 1) return '1 day left';
  return `${days} days left`;
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
