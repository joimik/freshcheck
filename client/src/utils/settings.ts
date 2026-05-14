import type { Category } from '../types';

export type Settings = {
  notificationsEnabled: boolean;
  alertDays: 1 | 2 | 3;
  defaultCategory: Category;
};

const KEY = 'shelflife.settings';

const defaults: Settings = {
  notificationsEnabled: false,
  alertDays: 2,
  defaultCategory: 'other',
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults;
    return { ...defaults, ...JSON.parse(raw) };
  } catch {
    return defaults;
  }
}

export function saveSettings(s: Settings) {
  localStorage.setItem(KEY, JSON.stringify(s));
}
