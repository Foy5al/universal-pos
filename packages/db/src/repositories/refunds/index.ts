import type { Database } from '../../client';
import type { StockLedgerRepository } from '../inventory/ledger';
import { createDrizzleRefundRepository } from './refund.drizzle';
import { InMemoryRefundRepository, type RefundRecord, type RefundRepository } from './refund';

export * from './refund';
export * from './refund.drizzle';

export interface RefundsRepository {
  refunds: RefundRepository;
}

export interface RefundsSeed {
  refunds?: readonly RefundRecord[];
}

export class InMemoryRefundsRepository implements RefundsRepository {
  readonly refunds: InMemoryRefundRepository;

  constructor(ledger: StockLedgerRepository, seed: RefundsSeed = {}) {
    this.refunds = new InMemoryRefundRepository(ledger, seed.refunds);
  }
}

export function createDrizzleRefundsRepository(db: Database): RefundsRepository {
  return { refunds: createDrizzleRefundRepository(db) };
}
