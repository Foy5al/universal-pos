import type { Database } from '../../client';
import type { StockLedgerRepository } from '../inventory/ledger';
import { createDrizzlePurchaseOrderRepository } from './order.drizzle';
import {
  InMemoryPurchaseOrderRepository,
  type PurchaseOrderRecord,
  type PurchaseOrderRepository,
} from './order';
import { createDrizzleRestockRequestRepository } from './restock.drizzle';
import {
  InMemoryRestockRequestRepository,
  type RestockRequestRecord,
  type RestockRequestRepository,
} from './restock';
import { createDrizzleSupplierProductRepository } from './supplier-product';
import {
  InMemorySupplierProductRepository,
  type SupplierProductRecord,
  type SupplierProductRepository,
} from './supplier-product';
import {
  createDrizzleSupplierRepository,
  InMemorySupplierRepository,
  type SupplierRecord,
  type SupplierRepository,
} from './supplier';

export * from './order';
export * from './order.drizzle';
export * from './restock';
export * from './restock.drizzle';
export * from './supplier';
export * from './supplier-product';

export interface PurchasingRepository {
  suppliers: SupplierRepository;
  orders: PurchaseOrderRepository;
  supplierProducts: SupplierProductRepository;
  restockRequests: RestockRequestRepository;
}

export interface PurchasingSeed {
  suppliers?: readonly SupplierRecord[];
  orders?: readonly PurchaseOrderRecord[];
  supplierProducts?: readonly SupplierProductRecord[];
  restockRequests?: readonly RestockRequestRecord[];
}

export class InMemoryPurchasingRepository implements PurchasingRepository {
  readonly suppliers: SupplierRepository;
  readonly orders: PurchaseOrderRepository;
  readonly supplierProducts: SupplierProductRepository;
  readonly restockRequests: RestockRequestRepository;

  constructor(ledger: StockLedgerRepository, seed: PurchasingSeed = {}) {
    this.suppliers = new InMemorySupplierRepository(seed.suppliers);
    this.orders = new InMemoryPurchaseOrderRepository(ledger, seed.orders);
    this.supplierProducts = new InMemorySupplierProductRepository(seed.supplierProducts);
    this.restockRequests = new InMemoryRestockRequestRepository(seed.restockRequests);
  }
}

export function createDrizzlePurchasingRepository(db: Database): PurchasingRepository {
  return {
    suppliers: createDrizzleSupplierRepository(db),
    orders: createDrizzlePurchaseOrderRepository(db),
    supplierProducts: createDrizzleSupplierProductRepository(db),
    restockRequests: createDrizzleRestockRequestRepository(db),
  };
}
