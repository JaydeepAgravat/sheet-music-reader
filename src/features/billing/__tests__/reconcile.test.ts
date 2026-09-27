import { PRODUCT_ID, reconcile, type OwnedPurchase } from '../reconcile';

const bought = (token = 't1', acknowledged = true): OwnedPurchase => ({ productId: PRODUCT_ID, purchaseToken: token, state: 'purchased', acknowledged });
const pending = (token = 'p1'): OwnedPurchase => ({ productId: PRODUCT_ID, purchaseToken: token, state: 'pending', acknowledged: false });
const FREE = { unlocked: false, token: null };
const PRO = { unlocked: true, token: 't1' };

describe('reconcile (entitlement policy)', () => {
  it('keeps the cache when Play could not answer', () => {
    expect(reconcile(PRO, null)).toEqual({ state: 'pro', cache: PRO, toAcknowledge: [] });
    expect(reconcile(FREE, null)).toEqual({ state: 'free', cache: FREE, toAcknowledge: [] });
  });

  it('grants Pro from a purchased pro_lifetime and caches its token', () => {
    const v = reconcile(FREE, [bought('abc')]);
    expect(v.state).toBe('pro');
    expect(v.cache).toEqual({ unlocked: true, token: 'abc' });
  });

  it('prefers the cached token when several purchases exist', () => {
    expect(reconcile(PRO, [bought('other'), bought('t1')]).cache.token).toBe('t1');
  });

  it('asks to acknowledge purchased-but-unacknowledged purchases', () => {
    expect(reconcile(FREE, [bought('x', false)]).toAcknowledge).toEqual(['x']);
    expect(reconcile(FREE, [bought('x', true)]).toAcknowledge).toEqual([]);
  });

  it('downgrades only when the query succeeded with no pro_lifetime at all', () => {
    expect(reconcile(PRO, [])).toEqual({ state: 'free', cache: FREE, toAcknowledge: [] });
    const other = { productId: 'something_else', purchaseToken: 'z', state: 'purchased', acknowledged: true };
    expect(reconcile(PRO, [other]).state).toBe('free');
  });

  it('never downgrades a cached Pro while Play still lists the product (pending or unspecified)', () => {
    expect(reconcile(PRO, [pending()]).state).toBe('pro');
    expect(reconcile(PRO, [{ ...bought('t1'), state: 'unspecified' }]).state).toBe('pro');
    expect(reconcile(PRO, [pending()]).cache).toEqual(PRO);
  });

  it('reports pending for a user without Pro', () => {
    expect(reconcile(FREE, [pending()])).toEqual({ state: 'pending', cache: FREE, toAcknowledge: [] });
  });

  it('ignores other products', () => {
    const other = { productId: 'tip_jar', purchaseToken: 'z', state: 'purchased', acknowledged: false };
    expect(reconcile(FREE, [other])).toEqual({ state: 'free', cache: FREE, toAcknowledge: [] });
  });
});
