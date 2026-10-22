import {
  page,
  type CreateRestockRequest,
  type Page,
  type Principal,
  type RestockRequestListQuery,
} from '@pos/contracts';
import type {
  ProductRepository,
  PurchaseOrderRecord,
  PurchasingRepository,
  RestockRequestRecord,
  StockLocationRepository,
} from '@pos/db';

import { conflict, notFound, validationError } from '../../core/errors';
import { hasStoreScope } from '../../core/principal';

export interface RestockService {
  list(principal: Principal, query: RestockRequestListQuery): Promise<Page<RestockRequestRecord>>;
  create(principal: Principal, input: CreateRestockRequest): Promise<RestockRequestRecord>;
  dismiss(principal: Principal, id: string): Promise<RestockRequestRecord>;
  validateForOrder(
    principal: Principal,
    locationId: string,
    requestIds: readonly string[],
    productIds: readonly string[],
  ): Promise<RestockRequestRecord[]>;
  schedule(order: PurchaseOrderRecord, requests: readonly RestockRequestRecord[]): Promise<void>;
  release(organizationId: string, purchaseOrderId: string): Promise<void>;
  fulfill(organizationId: string, purchaseOrderId: string): Promise<void>;
}

export function createRestockService(
  repo: PurchasingRepository,
  products: ProductRepository,
  locations: StockLocationRepository,
): RestockService {
  async function requireLocation(principal: Principal, locationId: string): Promise<void> {
    const location = await locations.findById(principal.organizationId, locationId);
    const scoped =
      location !== null &&
      (location.storeId === null
        ? principal.storeIds.length === 0
        : hasStoreScope(principal, location.storeId));
    if (!scoped) {
      throw notFound('Stock location not found');
    }
  }

  async function resolveLocationIds(principal: Principal): Promise<string[] | undefined> {
    if (principal.storeIds.length === 0) return undefined;
    const allowed = await locations.listByStoreIds(principal.organizationId, principal.storeIds);
    return allowed.map((location) => location.id);
  }

  async function requireRequest(principal: Principal, id: string): Promise<RestockRequestRecord> {
    const request = await repo.restockRequests.findById(principal.organizationId, id);
    if (!request) {
      throw notFound('Restock request not found');
    }
    await requireLocation(principal, request.locationId);
    return request;
  }

  return {
    async list(principal, query) {
      let locationIds = await resolveLocationIds(principal);
      if (query.locationId) {
        await requireLocation(principal, query.locationId);
        locationIds = [query.locationId];
      }
      const result = await repo.restockRequests.list(
        principal.organizationId,
        { status: query.status, locationIds },
        { limit: query.limit, offset: query.offset },
      );
      return page(result.items, result.total, query);
    },
    async create(principal, input) {
      await requireLocation(principal, input.locationId);
      const product = await products.findById(principal.organizationId, input.productId);
      if (!product) {
        throw notFound('Product not found');
      }
      return repo.restockRequests.create({
        organizationId: principal.organizationId,
        locationId: input.locationId,
        productId: input.productId,
        requestedByUserId: principal.userId,
        requestedByName: principal.displayName,
        requestedQuantity: input.quantity,
        note: input.note,
      });
    },
    async dismiss(principal, id) {
      const request = await requireRequest(principal, id);
      if (request.status !== 'pending') {
        throw conflict('Only pending restock requests can be dismissed');
      }
      const updated = await repo.restockRequests.dismiss(principal.organizationId, id);
      if (!updated) {
        throw conflict('Restock request was already processed');
      }
      return updated;
    },
    async validateForOrder(principal, locationId, requestIds, productIds) {
      await requireLocation(principal, locationId);
      const uniqueIds = [...new Set(requestIds)];
      const requests: RestockRequestRecord[] = [];
      for (const id of uniqueIds) {
        const request = await requireRequest(principal, id);
        if (request.status !== 'pending') {
          throw conflict('Restock request is no longer pending');
        }
        if (request.locationId !== locationId) {
          throw validationError('Restock requests must match the purchase order location');
        }
        if (!productIds.includes(request.productId)) {
          throw validationError('Every restock request needs a matching purchase order line');
        }
        requests.push(request);
      }
      return requests;
    },
    async schedule(order, requests) {
      await repo.restockRequests.schedule({
        organizationId: order.organizationId,
        locationId: order.locationId,
        purchaseOrderId: order.id,
        requestIds: requests.map((request) => request.id),
        lines: order.lines.map((line) => ({ id: line.id, productId: line.productId })),
      });
    },
    async release(organizationId, purchaseOrderId) {
      await repo.restockRequests.releaseByOrder(organizationId, purchaseOrderId);
    },
    async fulfill(organizationId, purchaseOrderId) {
      await repo.restockRequests.fulfillByOrder(organizationId, purchaseOrderId);
    },
  };
}
