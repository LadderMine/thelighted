// backend/src/modules/payments/sequence-allocator.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { StellarService } from './stellar.service';

/**
 * Hands out sequence numbers for building Stellar transactions, one at a
 * time per source account (issue #313: "Serialize sequence-number
 * allocation per source account and retry-with-refetch on tx_bad_seq").
 *
 * Horizon's account sequence only advances once a transaction actually
 * lands on-ledger — it does NOT advance just because we built (or even
 * signed) a transaction. Two builds for the same account issued back to
 * back would both read the same not-yet-incremented value from
 * loadAccount() and collide. This keeps an optimistic, in-process
 * next-sequence cache per account instead, advancing it the moment a
 * sequence is handed out rather than waiting for confirmation, and
 * serializes access per account so concurrent callers never read the same
 * cached value.
 *
 * If Horizon still rejects a submission with tx_bad_seq (our cached value
 * drifted from reality — e.g. a transaction we allocated for was abandoned
 * instead of submitted), invalidate() forces the next allocation for that
 * account to refetch fresh from Horizon rather than keep handing out
 * increasingly wrong values.
 */
@Injectable()
export class SequenceAllocator {
  private readonly logger = new Logger(SequenceAllocator.name);
  private readonly nextSequence = new Map<string, bigint>();
  private readonly queues = new Map<string, Promise<unknown>>();

  constructor(private readonly stellarService: StellarService) {}

  async allocate(sourceAccount: string): Promise<string> {
    return this.runExclusive(sourceAccount, async () => {
      let next = this.nextSequence.get(sourceAccount);
      if (next === undefined) {
        const account = await this.stellarService.loadAccount(sourceAccount);
        next = BigInt(account.sequence) + 1n;
      } else {
        next += 1n;
      }
      this.nextSequence.set(sourceAccount, next);
      return next.toString();
    });
  }

  invalidate(sourceAccount: string): void {
    this.logger.warn(
      `Invalidating cached sequence for ${sourceAccount} after a tx_bad_seq rejection`,
    );
    this.nextSequence.delete(sourceAccount);
  }

  /** Runs `fn` after every previously-queued call for `key` has settled, one at a time. */
  private async runExclusive<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const previousTail = this.queues.get(key) ?? Promise.resolve();
    const settledPrevious = previousTail.catch(() => undefined);
    const run = settledPrevious.then(fn);
    this.queues.set(
      key,
      run.catch(() => undefined),
    );
    return run;
  }
}
