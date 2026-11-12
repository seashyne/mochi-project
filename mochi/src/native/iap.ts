// Phase 3 IAP RPC contract.
//
// This is the web-side half of the StoreKit / Play Billing bridge. It defines
// the typed messages the native layer must implement and provides a web
// implementation that deliberately refuses to complete a purchase: real money
// must go through the web shop (Stripe-backed wallet/credits API), never
// through a simulated in-app purchase. Nothing here calls an endpoint.

import type { CoinLedgerEntry, Wallet } from '../api/shopTypes';

/** Path callers should route to when purchase() reports web-checkout-required. */
export const WEB_SHOP_PATH = '/shop';

export type IapFailureReason =
  | 'web-checkout-required'
  | 'native-handler-missing'
  | 'cancelled'
  | 'failed';

/** A purchasable credit pack, shaped against the existing shop/wallet types. */
export interface IapProduct {
  id: string;
  title: string;
  description: string;
  /** Real-money price in cents, charged by the web shop checkout. */
  priceCents: number;
  /** Wallet.balance delta / CoinLedgerEntry.delta when granted. */
  creditsGranted: number;
  /** StoreKit product identifier or Play Billing SKU, supplied natively. */
  nativeSku?: string;
}

/** Result of a purchase attempt. `ok: true` only ever comes from native IAP. */
export interface IapPurchase {
  ok: boolean;
  reason?: IapFailureReason;
  productId?: string;
  transactionId?: string;
  creditsGranted?: number;
  /** Post-purchase wallet state, matching src/api/shopTypes.ts Wallet. */
  wallet?: Wallet;
  /** Ledger entry recording the balance delta, matching CoinLedgerEntry. */
  ledgerEntry?: CoinLedgerEntry;
}

export interface IapBridge {
  listProducts(): Promise<IapProduct[]>;
  purchase(productId: string): Promise<IapPurchase>;
  restore(): Promise<IapPurchase[]>;
}

/**
 * Native implementation injected once Xcode / Android Studio scaffolding and
 * a real StoreKit 2 / Play Billing plugin exist. Every method is optional so
 * a partially implemented handler still falls back to the honest web paths.
 */
export interface IapNativeHandler {
  listProducts?: () => Promise<IapProduct[]>;
  purchase?: (productId: string) => Promise<IapPurchase>;
  restore?: () => Promise<IapPurchase[]>;
}

// Local catalog declaration only. There is no server round-trip: actual
// fulfillment is the web shop checkout writing a Wallet / CoinLedgerEntry.
const WEB_CREDIT_PACKS: readonly IapProduct[] = [
  {
    id: 'credits.small',
    title: 'Small Coin Pack',
    description: 'A small top-up for cosmetics in the web shop.',
    priceCents: 199,
    creditsGranted: 100
  },
  {
    id: 'credits.medium',
    title: 'Medium Coin Pack',
    description: 'A mid-sized top-up for cosmetics in the web shop.',
    priceCents: 499,
    creditsGranted: 300
  },
  {
    id: 'credits.large',
    title: 'Large Coin Pack',
    description: 'A large top-up for cosmetics in the web shop.',
    priceCents: 999,
    creditsGranted: 700
  }
];

/**
 * Web implementation. purchase() never succeeds: it returns
 * { ok: false, reason: 'web-checkout-required' } so callers are directed to
 * WEB_SHOP_PATH / the shop UI. restore() is empty because web has no native
 * receipts to restore. No fake wallet balances or ledger entries are created.
 */
export function createIapBridge(): IapBridge {
  return {
    listProducts: async () => WEB_CREDIT_PACKS.map(product => ({ ...product })),
    purchase: async () => ({ ok: false, reason: 'web-checkout-required' }),
    restore: async () => []
  };
}

/**
 * Injects a native StoreKit / Play Billing handler into an existing bridge.
 * The bridge is updated in place and returned for chaining. Native results
 * are passed through verbatim -- this function never invents a successful
 * purchase. A missing handler method falls back to the web behaviour, and a
 * throwing handler produces an explicit failure instead of a fake success.
 */
export function attachNativeIap(
  bridge: IapBridge,
  nativeHandler: IapNativeHandler | null | undefined
): IapBridge {
  if (!nativeHandler) return bridge;

  const webList = bridge.listProducts.bind(bridge);
  const webPurchase = bridge.purchase.bind(bridge);
  const webRestore = bridge.restore.bind(bridge);

  bridge.listProducts = async () => {
    if (!nativeHandler.listProducts) return webList();
    try {
      return await nativeHandler.listProducts();
    } catch {
      return [];
    }
  };

  bridge.purchase = async (productId: string) => {
    if (!nativeHandler.purchase) return webPurchase(productId);
    try {
      return await nativeHandler.purchase(productId);
    } catch {
      return { ok: false, reason: 'failed', productId };
    }
  };

  bridge.restore = async () => {
    if (!nativeHandler.restore) return webRestore();
    try {
      return await nativeHandler.restore();
    } catch {
      return [];
    }
  };

  return bridge;
}
