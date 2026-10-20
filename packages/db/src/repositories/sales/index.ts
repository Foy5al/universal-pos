import type { Database } from '../../client';
import type { StockLedgerRepository } from '../inventory/ledger';
import { createDrizzleSaleRepository } from './sale.drizzle';
import { InMemorySaleRepository, type SaleRecord, type SaleRepository } from './sale';

export * from './sale';
export * from './sale.drizzle';

export interface SalesRepository {
  sales: SaleRepository;
}

export interface SalesSeed {
  sales?: readonly SaleRecord[];
}

export class InMemorySalesRepository implements SalesRepository {
  readonly sales: InMemorySaleRepository;

  constructor(ledger: StockLedgerRepository, seed: SalesSeed = {}) {
    this.sales = new InMemorySaleRepository(ledger, seed.sales);
  }
}

export function createDrizzleSalesRepository(db: Database): SalesRepository {
  return { sales: createDrizzleSaleRepository(db) };
}
