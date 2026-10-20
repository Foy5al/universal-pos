import {
  page,
  type CreateStockAdjustmentRequest,
  type CreateStockLocationRequest,
  type CreateStockLossRequest,
  type InventoryListQuery,
  type Page,
  type StockLossListQuery,
  type UpdateStockLocationRequest,
} from '@pos/contracts';
import {
  InsufficientLedgerStockError,
  parseScaledQuantity,
  type InventoryRepository,
  type ProductRepository,
  type StockBalanceRecord,
  type StockLocationRecord,
  type StockMovementRecord,
} from '@pos/db';

import { conflict, notFound, validationError } from '../../core/errors';
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
  listLosses(organizationId: string, query: StockLossListQuery): Promise<Page<StockMovementRecord>>;
  adjust(
    organizationId: string,
    input: CreateStockAdjustmentRequest,
  ): Promise<StockAdjustmentResult>;
  recordLoss(organizationId: string, input: CreateStockLossRequest): Promise<StockAdjustmentResult>;
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
    async listLosses(organizationId, query) {
      const result = await repo.ledger.listMovements(
        organizationId,
        {
          locationId: query.locationId,
          productId: query.productId,
          onlyLosses: true,
          lossReason: query.reason,
        },
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
    async recordLoss(organizationId, input) {
      const location = await repo.locations.findById(organizationId, input.locationId);
      if (!location) {
        throw notFound('Stock location not found');
      }
      const product = await products.findById(organizationId, input.productId);
      if (!product) {
        throw notFound('Product not found');
      }
      if (input.reason === 'expired' && !input.expiresOn) {
        throw validationError('Expiry date is required for expired stock');
      }

      const quantity = parseScaledQuantity(input.quantity);
      try {
        return await repo.ledger.recordMovement({
          organizationId,
          locationId: input.locationId,
          productId: input.productId,
          movementType: 'issue',
          quantityDelta: -quantity,
          reason: input.note || undefined,
          lossReason: input.reason,
          expiresOn: input.expiresOn,
          unitCostMinor: product.costMinor,
          enforceNonNegative: true,
        });
      } catch (cause) {
        if (cause instanceof InsufficientLedgerStockError) {
          throw conflict(`Not enough stock on hand for ${product.name}`);
        }
        throw cause;
      }
    },
  };
}
