import type { Item } from '../types';
import { daysUntil } from './dates';

const LAST_NOTIFY_KEY = 'shelflife.lastNotify';

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('/sw.js');
  } catch (err) {
    console.warn('SW registration failed', err);
  }
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) return 'denied';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  return Notification.requestPermission();
}

export function notifyExpiringIfNeeded(items: Item[], alertDays: number) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  const expiring = items.filter((i) => {
    const d = daysUntil(i.expiry_date);
    return d >= 0 && d <= alertDays;
  });

  if (!expiring.length) return;

  // Avoid spamming — once per calendar day.
  const today = new Date().toISOString().slice(0, 10);
  const last = localStorage.getItem(LAST_NOTIFY_KEY);
  if (last === today) return;
  localStorage.setItem(LAST_NOTIFY_KEY, today);

  const count = expiring.length;
  const title = `🧀 ${count} item${count > 1 ? 's' : ''} expiring soon!`;
  const body =
    count === 1
      ? `${expiring[0].product_name} — use it before it goes bad.`
      : `Open ShelfLife to see what to use up.`;

  // Prefer SW notification (works while the tab is backgrounded) and fall back
  // to the page Notification API.
  navigator.serviceWorker?.ready
    .then((reg) => reg.showNotification(title, { body, icon: '/favicon.svg', tag: 'shelflife-expiring' }))
    .catch(() => new Notification(title, { body, icon: '/favicon.svg' }));
}
