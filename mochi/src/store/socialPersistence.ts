// localStorage persistence helpers for the local-first social layer

import { ChatThread, PersistedSocial } from './socialTypes';

export const SOCIAL_STORAGE_KEY = 'mochi_social_v1';

export const SOCIAL_GRADIENTS = [
  'from-sky-900 via-slate-900 to-indigo-950',
  'from-emerald-900 via-slate-900 to-teal-950',
  'from-indigo-900 via-slate-900 to-purple-950',
  'from-amber-900 via-slate-900 to-rose-950'
];

export function newSocialId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

function seedThreads(): ChatThread[] {
  return [
    {
      id: 'thread_system',
      name: 'Mochi Team',
      unread: 1,
      messages: [
        {
          id: 'msg_welcome',
          author: 'Mochi Team',
          body: 'ยินดีต้อนรับ! ข้อความนี้ถูกเก็บไว้ในเครื่องของคุณ เพิ่มเพื่อนแล้วเริ่มสนทนาได้เลย',
          at: '2026-11-10T00:00:00.000Z',
          self: false
        }
      ]
    }
  ];
}

function readStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    // Storage access can be blocked in private modes
  }
  return null;
}

export function loadPersistedSocial(): PersistedSocial {
  const fallback: PersistedSocial = {
    friends: [],
    threads: seedThreads(),
    groups: [],
    offers: [],
    readNoticeIds: [],
    isPlusMember: false
  };
  const storage = readStorage();
  if (!storage) return fallback;
  try {
    const raw = storage.getItem(SOCIAL_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<PersistedSocial>;
    return {
      friends: Array.isArray(parsed.friends) ? parsed.friends : [],
      threads: Array.isArray(parsed.threads) && parsed.threads.length > 0 ? parsed.threads : fallback.threads,
      groups: Array.isArray(parsed.groups) ? parsed.groups : [],
      offers: Array.isArray(parsed.offers) ? parsed.offers : [],
      readNoticeIds: Array.isArray(parsed.readNoticeIds) ? parsed.readNoticeIds : [],
      isPlusMember: Boolean(parsed.isPlusMember)
    };
  } catch {
    return fallback;
  }
}

export function persistSocial(state: PersistedSocial): void {
  const storage = readStorage();
  if (!storage) return;
  try {
    storage.setItem(SOCIAL_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore quota or privacy errors
  }
}

export function clearPersistedSocial(): void {
  const storage = readStorage();
  if (!storage) return;
  try {
    storage.removeItem(SOCIAL_STORAGE_KEY);
  } catch {
    // Ignore privacy errors
  }
}
