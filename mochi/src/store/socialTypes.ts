// Local-first social data types shared by the store, pages, and persistence layer

export type SocialPresence = 'online' | 'in_game' | 'studio' | 'offline';
export type SocialTier = 'bronze' | 'silver' | 'gold' | 'cyber';

export interface SocialFriend {
  id: string;
  name: string;
  presence: SocialPresence;
  tier: SocialTier;
  innerGradient: string;
  addedAt: string;
}

export interface ChatMessage {
  id: string;
  author: string;
  body: string;
  at: string;
  self: boolean;
}

export interface ChatThread {
  id: string;
  name: string;
  messages: ChatMessage[];
  unread: number;
}

export interface SocialGroup {
  id: string;
  name: string;
  description: string;
  members: number;
  joined: boolean;
}

export type TradeStatus = 'open' | 'completed' | 'cancelled';

export interface TradeOffer {
  id: string;
  itemId: string;
  itemName: string;
  toName: string;
  note: string;
  status: TradeStatus;
  at: string;
}

export interface PersistedSocial {
  friends: SocialFriend[];
  threads: ChatThread[];
  groups: SocialGroup[];
  offers: TradeOffer[];
  readNoticeIds: string[];
  isPlusMember: boolean;
}
