/**
 * Free-tier import slots for one batch, shared by concurrent workers.
 *
 * A file takes a slot *before* it is copied (files over the limit are never copied). A slot is
 * only spent when the file really becomes a score: a duplicate or a failed copy gives it back.
 * When every slot is taken but some are still in flight, the next file waits for them to settle
 * instead of being turned away — so a duplicate early in the batch doesn't cost the user a slot.
 */
export class LimitGate {
  private used = 0;
  private inFlight = 0;
  /** Files waiting for an in-flight slot to settle, first come first served. */
  private waiters: Array<(ok: boolean) => void> = [];

  /** limit = how many more scores may be added (Infinity for Pro). */
  constructor(private readonly limit: number) {}

  /** Resolves true with a slot reserved, or false when the limit is reached. */
  acquire(): Promise<boolean> {
    // While anyone waits, the gate is full, so newcomers always queue behind them (FIFO).
    if (this.used + this.inFlight < this.limit) {
      this.inFlight++;
      return Promise.resolve(true);
    }
    if (this.inFlight === 0) return Promise.resolve(false);
    return new Promise(resolve => this.waiters.push(resolve));
  }

  /** The reserved file became a score. */
  commit(): void {
    this.inFlight--;
    this.used++;
    // Nothing left in flight that could free a slot: everyone still waiting is over the limit.
    if (this.inFlight === 0) this.waiters.splice(0).forEach(resolve => resolve(false));
  }

  /** The reserved file was a duplicate or failed: its slot passes to the next waiter, or frees up. */
  release(): void {
    const next = this.waiters.shift();
    if (next) next(true);
    else this.inFlight--;
  }
}
