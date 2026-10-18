import {
  page,
  type CreateStockAdjustmentRequest,
  type CreateStockLocationRequest,
  type InventoryListQuery,
  type Page,
  type UpdateStockLocationRequest,
} from '@pos/contracts';
import {
  parseScaledQuantity,
  type InventoryRepository,
  type ProductRepository,
  type StockBalanceRecord,
  type StockLocationRecord,
  type StockMovementRecord,
} from '@pos/db';

import { notFound } from '../../core/errors';
import { createCrudService, type CrudService } from '../catalog';

export interface StockAdjustmentResult {
  movement: StockMovementRecord;
  balance: StockBalanceRecord;
}

export interface InventoryService {
  locations: CrudService<
    StockLocationRecord,
    CreateStockLocationRequest,
    UpdateStockLocationRequest
  >;
  listBalances(
    organizationId: string,
    query: InventoryListQuery,
  ): Promise<Page<StockBalanceRecord>>;
  listMovements(
    organizationId: string,
    query: InventoryListQuery,
  ): Promise<Page<StockMovementRecord>>;
  adjust(
    organizationId: string,
    input: CreateStockAdjustmentRequest,
  ): Promise<StockAdjustmentResult>;
}

export function createInventoryService(
  repo: InventoryRepository,
  products: ProductRepository,
): InventoryService {
  const locations = createCrudService(repo.locations, 'Stock location');

  return {
    locations,
    async listBalances(organizationId, query) {
      const result = await repo.ledger.listBalances(
        organizationId,
        { locationId: query.locationId, productId: query.productId },
        { limit: query.limit, offset: query.offset },
      );
      return page(result.items, result.total, query);
    },
    async listMovements(organizationId, query) {
      const result = await repo.ledger.listMovements(
        organizationId,
        { locationId: query.locationId, productId: query.productId },
        { limit: query.limit, offset: query.offset },
      );
      return page(result.items, result.total, query);
    },
    async adjust(organizationId, input) {
      const location = await repo.locations.findById(organizationId, input.locationId);
      if (!location) {
        throw notFound('Stock location not found');
      }
      const product = await products.findById(organizationId, input.productId);
      if (!product) {
        throw notFound('Product not found');
      }

      return repo.ledger.recordMovement({
        organizationId,
        locationId: input.locationId,
        productId: input.productId,
        movementType: 'adjustment',
        quantityDelta: parseScaledQuantity(input.quantityDelta),
        reason: input.reason,
      });
    },
  };
}
