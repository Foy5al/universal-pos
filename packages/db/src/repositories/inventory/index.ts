import type { Database } from '../../client';
import { InMemoryStockLedgerRepository, type StockLedgerRepository } from './ledger';
import { createDrizzleStockLedgerRepository } from './ledger.drizzle';
import {
  createDrizzleStockLocationRepository,
  InMemoryStockLocationRepository,
  type StockLocationRecord,
  type StockLocationRepository,
} from './location';
import {
  createDrizzleLowStockSettingsRepository,
  InMemoryLowStockSettingsRepository,
  type LowStockSettingsRepository,
} from './lowStock';

export * from './ledger';
export * from './ledger.drizzle';
export * from './location';
export * from './lowStock';
export * from './quantity';

export interface InventoryRepository {
  locations: StockLocationRepository;
  ledger: StockLedgerRepository;
  lowStock: LowStockSettingsRepository;
}

export interface InventorySeed {
  locations?: readonly StockLocationRecord[];
}

export class InMemoryInventoryRepository implements InventoryRepository {
  readonly locations: StockLocationRepository;
  readonly ledger: StockLedgerRepository;
  readonly lowStock: LowStockSettingsRepository;

  constructor(seed: InventorySeed = {}) {
    this.locations = new InMemoryStockLocationRepository(seed.locations);
    this.ledger = new InMemoryStockLedgerRepository();
    this.lowStock = new InMemoryLowStockSettingsRepository();
  }
}

export function createDrizzleInventoryRepository(db: Database): InventoryRepository {
  return {
    locations: createDrizzleStockLocationRepository(db),
    ledger: createDrizzleStockLedgerRepository(db),
    lowStock: createDrizzleLowStockSettingsRepository(db),
  };
}
