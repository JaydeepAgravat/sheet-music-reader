import type * as Entitlement from '../entitlement';
import type * as Prefs from '@/data/prefs';

jest.mock('@/data/repos/scores', () => ({ FREE_SCORE_LIMIT: 15, countScores: jest.fn(() => ({ total: 0, counted: 0 })) }));
jest.mock('@/data/repos/setlists', () => ({ countSetlists: jest.fn(() => 0) }));
jest.mock('@/app/navigationRef', () => ({
  navigationRef: { isReady: jest.fn(() => true), getCurrentRoute: jest.fn(() => ({ name: 'Main' })), navigate: jest.fn() },
}));
jest.mock('@/ui/feedback/store', () => ({ showToast: jest.fn() }));
jest.mock('@/i18n', () => ({ __esModule: true, default: { t: (k: string) => k } }));

type Setup = {
  ent: typeof Entitlement;
  prefs: typeof Prefs;
  billing: {
    connect: jest.Mock;
    getProduct: jest.Mock;
    purchase: jest.Mock;
    queryOwned: jest.Mock;
    acknowledge: jest.Mock;
    onPurchaseUpdate: jest.Mock;
  };
  nav: { navigate: jest.Mock; getCurrentRoute: jest.Mock };
  scores: { countScores: jest.Mock };
  setlists: { countSetlists: jest.Mock };
  toast: jest.Mock;
  emit: (u: Record<string, unknown>) => void;
};

const flush = async () => {
  for (let i = 0; i < 10; i++) await new Promise<void>(r => setImmediate(r));
};

const purchase = (over: Record<string, unknown> = {}) => ({
  productId: 'pro_lifetime',
  purchaseToken: 'tok',
  orderId: 'GPA.1',
  state: 'purchased',
  acknowledged: true,
  purchaseTime: 1,
  ...over,
});

/** Fresh modules; `cache` is written to MMKV before entitlement.ts loads (it reads it at import). */
function setup(cache: { unlocked: boolean; token: string | null } = { unlocked: false, token: null }): Setup {
  jest.resetModules();
  const prefs = require('@/data/prefs') as typeof Prefs;
  prefs.setPref('proUnlocked', cache.unlocked);
  prefs.setPref('proToken', cache.token);
  const billing = require('@/specs/NativeBilling').default;
  const ent = require('../entitlement') as typeof Entitlement;
  const nav = require('@/app/navigationRef').navigationRef;
  return {
    ent,
    prefs,
    billing,
    nav,
    scores: require('@/data/repos/scores'),
    setlists: require('@/data/repos/setlists'),
    toast: require('@/ui/feedback/store').showToast,
    emit: u => {
      const listener = billing.onPurchaseUpdate.mock.calls[0]?.[0];
      listener({ productId: 'pro_lifetime', purchaseToken: '', orderId: '', acknowledged: false, errorCode: 0, debugMessage: '', ...u });
    },
  };
}

describe('entitlement', () => {
  it('trusts the cache instantly and keeps Pro offline (Play unavailable)', async () => {
    const s = setup({ unlocked: true, token: 'tok' });
    expect(s.ent.usePro.getState()).toMatchObject({ isPro: true, state: 'pro' });
    s.billing.connect.mockResolvedValue(false);
    s.ent.initBilling();
    await flush();
    expect(s.ent.usePro.getState()).toMatchObject({ isPro: true, state: 'pro', available: false });
    expect(s.billing.queryOwned).not.toHaveBeenCalled();
  });

  it('keeps Pro when the query fails (unknown is not "not owned")', async () => {
    const s = setup({ unlocked: true, token: 'tok' });
    s.billing.connect.mockResolvedValue(true);
    s.billing.queryOwned.mockRejectedValue(Object.assign(new Error('x'), { code: 'E_QUERY' }));
    s.ent.initBilling();
    await flush();
    expect(s.ent.usePro.getState().isPro).toBe(true);
    expect(s.prefs.getPref('proUnlocked')).toBe(true);
  });

  it('downgrades only when Play answered with no purchase', async () => {
    const s = setup({ unlocked: true, token: 'tok' });
    s.billing.connect.mockResolvedValue(true);
    s.billing.queryOwned.mockResolvedValue([]);
    s.ent.initBilling();
    await flush();
    expect(s.ent.usePro.getState()).toMatchObject({ isPro: false, state: 'free' });
    expect(s.prefs.getPref('proUnlocked')).toBe(false);
    expect(s.prefs.getPref('proToken')).toBeNull();
  });

  it('restores Pro on a fresh install and acknowledges a stray unacknowledged purchase', async () => {
    const s = setup();
    expect(s.ent.usePro.getState().state).toBe('unknown');
    s.billing.connect.mockResolvedValue(true);
    s.billing.queryOwned.mockResolvedValue([purchase({ purchaseToken: 'new', acknowledged: false })]);
    s.billing.getProduct.mockResolvedValue({ productId: 'pro_lifetime', price: '9,99 €', priceMicros: 9990000, currency: 'EUR', title: 'Pro' });
    s.ent.initBilling();
    await flush();
    expect(s.ent.usePro.getState()).toMatchObject({ isPro: true, state: 'pro', price: '9,99 €' });
    expect(s.prefs.getPref('proToken')).toBe('new');
    expect(s.billing.acknowledge).toHaveBeenCalledWith('new');
  });

  it('settles on free when nothing is cached and Play is unavailable', async () => {
    const s = setup();
    s.billing.connect.mockResolvedValue(false);
    s.ent.initBilling();
    await flush();
    expect(s.ent.usePro.getState()).toMatchObject({ isPro: false, state: 'free', available: false });
  });

  it('buy → pending → purchased', async () => {
    const s = setup();
    s.billing.connect.mockResolvedValue(true);
    s.ent.initBilling();
    await flush();
    await s.ent.buyPro();
    expect(s.billing.purchase).toHaveBeenCalledWith('pro_lifetime');
    expect(s.ent.usePro.getState().busy).toBe(true);

    s.emit({ state: 'pending', purchaseToken: 'p' });
    expect(s.ent.usePro.getState()).toMatchObject({ state: 'pending', isPro: false, busy: false });
    expect(s.prefs.getPref('proUnlocked')).toBe(false);

    s.emit({ state: 'purchased', purchaseToken: 'p', acknowledged: true });
    expect(s.ent.usePro.getState()).toMatchObject({ state: 'pro', isPro: true, justUnlocked: true });
    expect(s.prefs.getPref('proUnlocked')).toBe(true);
    expect(s.prefs.getPref('proToken')).toBe('p');
  });

  it('cancel clears busy without an error; errors are reported', async () => {
    const s = setup();
    s.billing.connect.mockResolvedValue(true);
    s.ent.initBilling();
    await s.ent.buyPro();
    s.emit({ state: 'cancelled', productId: '' });
    expect(s.ent.usePro.getState()).toMatchObject({ busy: false, error: null, isPro: false });
    await s.ent.buyPro();
    s.emit({ state: 'error', productId: '', errorCode: 6 });
    expect(s.ent.usePro.getState()).toMatchObject({ busy: false, error: 'failed' });
  });

  it('reports unavailable when Play cannot connect', async () => {
    const s = setup();
    s.billing.connect.mockResolvedValue(false);
    await s.ent.buyPro();
    expect(s.ent.usePro.getState()).toMatchObject({ busy: false, error: 'unavailable' });
    expect(s.billing.purchase).not.toHaveBeenCalled();
  });

  it('alreadyOwned restores quietly', async () => {
    const s = setup();
    s.billing.connect.mockResolvedValue(true);
    s.ent.initBilling();
    await flush();
    s.billing.queryOwned.mockResolvedValue([purchase()]);
    s.emit({ state: 'alreadyOwned', productId: 'pro_lifetime', errorCode: 7 });
    await flush();
    expect(s.ent.usePro.getState()).toMatchObject({ isPro: true, busy: false });
  });

  it('restorePurchases toasts the outcome', async () => {
    const s = setup();
    s.billing.connect.mockResolvedValue(true);
    s.billing.queryOwned.mockResolvedValue([]);
    expect(await s.ent.restorePurchases()).toBe('none');
    expect(s.toast).toHaveBeenLastCalledWith(expect.objectContaining({ message: 'billing.restore.none' }));
    s.billing.queryOwned.mockResolvedValue([purchase()]);
    expect(await s.ent.restorePurchases()).toBe('restored');
    expect(s.toast).toHaveBeenLastCalledWith(expect.objectContaining({ message: 'billing.restore.restored' }));
    expect(s.ent.usePro.getState().isPro).toBe(true);
  });

  describe('gating', () => {
    it('setlists: the first is free, the second opens the paywall', () => {
      const s = setup();
      s.setlists.countSetlists.mockReturnValue(0);
      expect(s.ent.requirePro('setlists')).toBe(true);
      s.setlists.countSetlists.mockReturnValue(1);
      expect(s.ent.requirePro('setlists')).toBe(false);
      expect(s.nav.navigate).toHaveBeenCalledWith('Paywall', { reason: 'setlists' });
    });

    it('imports: locked at 15 counted scores (samples excluded)', () => {
      const s = setup();
      s.scores.countScores.mockReturnValue({ total: 19, counted: 14 });
      expect(s.ent.isLocked('imports')).toBe(false);
      s.scores.countScores.mockReturnValue({ total: 19, counted: 15 });
      expect(s.ent.isLocked('imports')).toBe(true);
    });

    it('Pro is never locked', () => {
      const s = setup({ unlocked: true, token: 't' });
      s.setlists.countSetlists.mockReturnValue(40);
      s.scores.countScores.mockReturnValue({ total: 900, counted: 900 });
      expect(s.ent.requirePro('setlists')).toBe(true);
      expect(s.ent.requirePro('imports')).toBe(true);
      expect(s.nav.navigate).not.toHaveBeenCalled();
    });

    it('does not stack a second paywall', () => {
      const s = setup();
      s.nav.getCurrentRoute.mockReturnValue({ name: 'Paywall' });
      s.ent.openPaywall('imports');
      expect(s.nav.navigate).not.toHaveBeenCalled();
    });

    it('dev override flips Pro in memory only', () => {
      const s = setup();
      s.ent.setDevPro(true);
      expect(s.ent.usePro.getState().isPro).toBe(true);
      expect(s.prefs.getPref('proUnlocked')).toBe(false);
      s.ent.setDevPro(null);
      expect(s.ent.usePro.getState().isPro).toBe(false);
    });
  });
});
