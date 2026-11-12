// Local-first social graph: friends, message threads, groups, trade offers, and notice read state.
// Everything persists to localStorage so the social pages keep working between sessions.

import { create } from 'zustand';
import {
  PersistedSocial,
  SocialTier,
  TradeStatus
} from './socialTypes';
import {
  clearPersistedSocial,
  loadPersistedSocial,
  newSocialId,
  nowIso,
  persistSocial,
  SOCIAL_GRADIENTS
} from './socialPersistence';

export type {
  ChatMessage,
  ChatThread,
  SocialFriend,
  SocialGroup,
  SocialPresence,
  SocialTier,
  TradeOffer,
  TradeStatus
} from './socialTypes';

export interface SocialState extends PersistedSocial {
  addFriend: (name: string) => boolean;
  removeFriend: (id: string) => void;
  ensureThread: (name: string) => string;
  sendMessage: (threadId: string, body: string) => void;
  markThreadRead: (threadId: string) => void;
  createGroup: (name: string, description: string) => void;
  toggleGroup: (id: string) => void;
  createOffer: (itemId: string, itemName: string, toName: string, note: string) => void;
  setOfferStatus: (id: string, status: TradeStatus) => void;
  markNoticeRead: (id: string) => void;
  markAllNoticesRead: (ids: string[]) => void;
  setPlusMember: (value: boolean) => void;
  resetSocial: () => void;
}

function toPersisted(state: SocialState): PersistedSocial {
  return {
    friends: state.friends,
    threads: state.threads,
    groups: state.groups,
    offers: state.offers,
    readNoticeIds: state.readNoticeIds,
    isPlusMember: state.isPlusMember
  };
}

const initial = loadPersistedSocial();

export const useSocialStore = create<SocialState>((set, get) => {
  const commit = (patch: Partial<SocialState>) => {
    set(patch);
    persistSocial(toPersisted(get()));
  };

  return {
    ...initial,

    addFriend: (name: string) => {
      const clean = name.trim();
      if (!clean) return false;
      const exists = get().friends.some((f) => f.name.toLowerCase() === clean.toLowerCase());
      if (exists) return false;
      const index = clean.length % SOCIAL_GRADIENTS.length;
      const tier: SocialTier = index === 0 ? 'cyber' : index === 1 ? 'silver' : index === 2 ? 'gold' : 'bronze';
      commit({
        friends: [
          {
            id: newSocialId('friend'),
            name: clean,
            presence: 'online',
            tier,
            innerGradient: SOCIAL_GRADIENTS[index],
            addedAt: nowIso()
          },
          ...get().friends
        ]
      });
      return true;
    },

    removeFriend: (id: string) => {
      commit({ friends: get().friends.filter((f) => f.id !== id) });
    },

    ensureThread: (name: string) => {
      const clean = name.trim();
      const existing = get().threads.find((t) => t.name.toLowerCase() === clean.toLowerCase());
      if (existing) return existing.id;
      const id = newSocialId('thread');
      commit({
        threads: [{ id, name: clean || 'New conversation', messages: [], unread: 0 }, ...get().threads]
      });
      return id;
    },

    sendMessage: (threadId: string, body: string) => {
      const clean = body.trim();
      if (!clean) return;
      commit({
        threads: get().threads.map((thread) =>
          thread.id === threadId
            ? {
                ...thread,
                messages: [
                  ...thread.messages,
                  { id: newSocialId('msg'), author: 'You', body: clean, at: nowIso(), self: true }
                ]
              }
            : thread
        )
      });
    },

    markThreadRead: (threadId: string) => {
      commit({
        threads: get().threads.map((thread) =>
          thread.id === threadId ? { ...thread, unread: 0 } : thread
        )
      });
    },

    createGroup: (name: string, description: string) => {
      const clean = name.trim();
      if (!clean) return;
      commit({
        groups: [
          { id: newSocialId('group'), name: clean, description: description.trim(), members: 1, joined: true },
          ...get().groups
        ]
      });
    },

    toggleGroup: (id: string) => {
      commit({
        groups: get().groups.map((group) =>
          group.id === id
            ? {
                ...group,
                joined: !group.joined,
                members: Math.max(0, group.members + (group.joined ? -1 : 1))
              }
            : group
        )
      });
    },

    createOffer: (itemId: string, itemName: string, toName: string, note: string) => {
      commit({
        offers: [
          { id: newSocialId('offer'), itemId, itemName, toName, note: note.trim(), status: 'open', at: nowIso() },
          ...get().offers
        ]
      });
    },

    setOfferStatus: (id: string, status: TradeStatus) => {
      commit({ offers: get().offers.map((offer) => (offer.id === id ? { ...offer, status } : offer)) });
    },

    markNoticeRead: (id: string) => {
      if (get().readNoticeIds.includes(id)) return;
      commit({ readNoticeIds: [...get().readNoticeIds, id] });
    },

    markAllNoticesRead: (ids: string[]) => {
      commit({ readNoticeIds: Array.from(new Set([...get().readNoticeIds, ...ids])) });
    },

    setPlusMember: (value: boolean) => {
      commit({ isPlusMember: value });
    },

    resetSocial: () => {
      clearPersistedSocial();
      set({ ...loadPersistedSocial() });
    }
  };
});
