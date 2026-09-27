import { AppState } from 'react-native';
import { create } from 'zustand';
import NativeBilling, { type PurchaseUpdate } from '@/specs/NativeBilling';
import { navigationRef } from '@/app/navigationRef';
import { getPref, setPref } from '@/data/prefs';
import { countScores, FREE_SCORE_LIMIT } from '@/data/repos/scores';
import { countSetlists } from '@/data/repos/setlists';
import i18n from '@/i18n';
import { showToast } from '@/ui/feedback/store';
import { PRODUCT_ID, reconcile, type EntitlementCache } from './reconcile';

/**
 * Pro entitlement (one-time `pro_lifetime`, docs/PLAN.md §1.1).
 *
 * Offline-first: the MMKV cache is read synchronously at startup, so a paying user is Pro from the
 * first frame even with no network or no Play. initBilling() then re-verifies with Play in the
 * background; see reconcile.ts for the (conservative) downgrade policy.
 *
 * Gating never locks what the user already has: existing scores and setlists always open; only
 * adding past the free limits needs Pro.
 */

export { PRODUCT_ID, FREE_SCORE_LIMIT };
export const FREE_SETLIST_LIMIT = 1;

/** 'unknown' = no cached Pro and Play hasn't answered yet (free limits apply meanwhile). */
export type ProState = 'unknown' | 'free' | 'pro' | 'pending';
export type ProReason = 'imports' | 'setlists' | 'settings';
/** unavailable = no Play Billing on this device; notFound = product not set up in Play; failed = anything else. */
export type BillingError = 'unavailable' | 'notFound' | 'failed';
export type RestoreResult = 'restored' | 'pending' | 'none' | 'unavailable' | 'error';

type ProStore = {
  isPro: boolean;
  state: ProState;
  /** Localized price from Play ("9,99 €"); null until known. Never hard-coded. */
  price: string | null;
  /** Play Billing reachable: null = not checked yet. */
  available: boolean | null;
  /** A purchase or restore is in flight. */
  busy: boolean;
  error: BillingError | null;
  /** Pro was unlocked by a purchase in this session (the paywall celebrates, then closes). */
  justUnlocked: boolean;
};

function readCache(): EntitlementCache {
  return { unlocked: getPref('proUnlocked'), token: getPref('proToken') };
}

function writeCache(c: EntitlementCache): void {
  if (getPref('proUnlocked') !== c.unlocked) setPref('proUnlocked', c.unlocked);
  if (getPref('proToken') !== c.token) setPref('proToken', c.token);
}

const initialPro = getPref('proUnlocked');

export const usePro = create<ProStore>(() => ({
  isPro: initialPro,
  state: initialPro ? 'pro' : 'unknown',
  price: null,
  available: null,
  busy: false,
  error: null,
  justUnlocked: false,
}));

/** __DEV__ only: forces Pro on/off in memory (never cached), ignoring Play until the next reload. */
let devOverride: boolean | null = null;

function setState(state: ProState, extra: Partial<ProStore> = {}): void {
  const isPro = devOverride ?? state === 'pro';
  usePro.setState({ state: devOverride === null ? state : isPro ? 'pro' : 'free', isPro, ...extra });
}

function grant(token: string, extra: Partial<ProStore> = {}): void {
  writeCache({ unlocked: true, token: token || getPref('proToken') });
  setState('pro', { busy: false, error: null, ...extra });
}

// --- Play ------------------------------------------------------------------------------------------

async function connect(): Promise<boolean> {
  const ok = await NativeBilling.connect().catch(() => false);
  usePro.setState({ available: ok });
  return ok;
}

/** Loads the localized price (paywall + settings). Safe to call repeatedly. */
export async function refreshPrice(): Promise<void> {
  if (!(await connect())) return;
  const product = await NativeBilling.getProduct(PRODUCT_ID).catch(() => null);
  // Connected but no product (not published yet, or not offered to this account): say so rather
  // than showing a price placeholder forever.
  if (product?.price) usePro.setState(st => ({ price: product.price, error: st.error === 'notFound' ? null : st.error }));
  else usePro.setState(st => (st.error ? {} : { error: 'notFound' }));
}

/** Asks Play what this account owns and applies the policy. */
async function verify(): Promise<RestoreResult> {
  if (!(await connect())) return 'unavailable';
  refreshPrice().catch(() => undefined);
  let owned;
  try {
    owned = await NativeBilling.queryOwned();
  } catch {
    return 'error';
  }
  const verdict = reconcile(readCache(), owned);
  writeCache(verdict.cache);
  // A pending purchase never demotes a cached Pro (reconcile already returned 'pro' for that).
  setState(verdict.state);
  verdict.toAcknowledge.forEach(token => NativeBilling.acknowledge(token).catch(() => false));
  return verdict.state === 'pro' ? 'restored' : verdict.state === 'pending' ? 'pending' : 'none';
}

function onPurchaseUpdate(u: PurchaseUpdate): void {
  if (u.productId && u.productId !== PRODUCT_ID) return;
  clearWatchdog();
  switch (u.state) {
    case 'purchased':
      grant(u.purchaseToken, { justUnlocked: true });
      // Native already tried; if Play was unreachable, retry once now (and again on next launch).
      if (!u.acknowledged && u.purchaseToken) NativeBilling.acknowledge(u.purchaseToken).catch(() => false);
      break;
    case 'pending':
      if (!usePro.getState().isPro) setState('pending');
      usePro.setState({ busy: false, error: null });
      break;
    case 'alreadyOwned':
      // Bought before (another device, or a reinstall): restore quietly.
      verify()
        .then(r => usePro.setState({ busy: false, justUnlocked: r === 'restored' }))
        .catch(() => usePro.setState({ busy: false }));
      break;
    case 'cancelled':
      usePro.setState({ busy: false });
      break;
    default:
      usePro.setState({ busy: false, error: 'failed' });
  }
}

/**
 * If the purchase sheet closes but no update ever arrives (e.g. JS reloaded mid-flow), don't leave
 * the Buy button spinning: once we're back in the foreground, re-check with Play after a moment.
 */
let watchdog: ReturnType<typeof setTimeout> | null = null;
function clearWatchdog(): void {
  if (watchdog) clearTimeout(watchdog);
  watchdog = null;
}

let started = false;

/** App start (App.tsx): cached state is already live; this subscribes and re-verifies in the background. */
export function initBilling(): void {
  if (started) return;
  started = true;
  NativeBilling.onPurchaseUpdate(onPurchaseUpdate);
  AppState.addEventListener('change', s => {
    if (s !== 'active' || !usePro.getState().busy || watchdog) return;
    watchdog = setTimeout(() => {
      watchdog = null;
      if (!usePro.getState().busy) return;
      verify()
        .catch(() => 'error' as const)
        .finally(() => usePro.setState({ busy: false }));
    }, 4000);
  });
  verify()
    .then(r => {
      // Couldn't reach Play and nothing cached: we know enough to say "free".
      if (r !== 'restored' && r !== 'pending' && usePro.getState().state === 'unknown') setState('free');
    })
    .catch(() => undefined);
}

// --- Actions ---------------------------------------------------------------------------------------

/** Paywall "Buy". The outcome arrives via onPurchaseUpdate; busy stays true until then. */
export async function buyPro(): Promise<void> {
  if (usePro.getState().busy) return;
  usePro.setState({ busy: true, error: null, justUnlocked: false });
  if (!(await connect())) {
    usePro.setState({ busy: false, error: 'unavailable' });
    return;
  }
  try {
    await NativeBilling.purchase(PRODUCT_ID);
  } catch (e) {
    const code = (e as { code?: string })?.code;
    usePro.setState({ busy: false, error: code === 'E_UNAVAILABLE' ? 'unavailable' : code === 'E_NO_PRODUCT' ? 'notFound' : 'failed' });
  }
}

/** "Restore purchase": re-asks Play and says what happened in a toast. */
export async function restorePurchases(): Promise<RestoreResult> {
  if (usePro.getState().busy) return 'error';
  usePro.setState({ busy: true, error: null });
  const wasPro = usePro.getState().isPro;
  const result = await verify().catch(() => 'error' as const);
  usePro.setState({ busy: false });
  if (result === 'restored') {
    showToast({ message: i18n.t(wasPro ? 'billing.restore.alreadyPro' : 'billing.restore.restored'), icon: 'seal-check' });
  } else {
    showToast({ message: i18n.t(`billing.restore.${result}`), icon: result === 'pending' ? 'hourglass-medium' : 'info' });
  }
  return result;
}

/** Clears the one-shot celebration flag (paywall closed). */
export function acknowledgeUnlock(): void {
  if (usePro.getState().justUnlocked) usePro.setState({ justUnlocked: false });
}

export function setDevPro(pro: boolean | null): void {
  if (!__DEV__) return;
  devOverride = pro;
  const cached = getPref('proUnlocked');
  setState(cached ? 'pro' : 'free');
}

// --- Gating ----------------------------------------------------------------------------------------

/** Would this action need Pro right now? (Pro users: never.) */
export function isLocked(reason: ProReason): boolean {
  if (usePro.getState().isPro) return false;
  switch (reason) {
    case 'imports':
      return countScores().counted >= FREE_SCORE_LIMIT;
    case 'setlists':
      return countSetlists() >= FREE_SETLIST_LIMIT;
    default:
      return true;
  }
}

export function openPaywall(reason: ProReason): void {
  if (!navigationRef.isReady()) return;
  if (navigationRef.getCurrentRoute()?.name === 'Paywall') return;
  navigationRef.navigate('Paywall', { reason });
}

/**
 * Guard for Pro actions: true = go ahead. When locked, opens the paywall and returns false.
 *   if (!requirePro('setlists')) return;
 */
export function requirePro(reason: ProReason): boolean {
  if (!isLocked(reason)) return true;
  openPaywall(reason);
  return false;
}
