import {
  page,
  type CreatePurchaseOrderRequest,
  type CreateSupplierRequest,
  type Page,
  type Principal,
  type PurchaseOrderListQuery,
  type PurchaseOrderStatus,
  type ReceivePurchaseOrderRequest,
  type UpdatePurchaseOrderStatusRequest,
  type UpdateSupplierRequest,
} from '@pos/contracts';
import {
  parseScaledQuantity,
  ReceiveConflictError,
  type ProductRepository,
  type PurchaseOrderRecord,
  type PurchasingRepository,
  type ReceiveResult,
  type StockLocationRepository,
  type SupplierRecord,
} from '@pos/db';

import { conflict, notFound, validationError } from '../../core/errors';
import { hasStoreScope } from '../../core/principal';
import { createCrudService, type CrudService } from '../catalog';
import { createRestockService, type RestockService } from './restock';
import { createSupplierProductService, type SupplierProductService } from './supplier-products';

export interface PurchasingService {
  suppliers: CrudService<SupplierRecord, CreateSupplierRequest, UpdateSupplierRequest>;
  supplierProducts: SupplierProductService;
  restock: RestockService;
  listOrders(
    principal: Principal,
    query: PurchaseOrderListQuery,
  ): Promise<Page<PurchaseOrderRecord>>;
  getOrder(principal: Principal, id: string): Promise<PurchaseOrderRecord>;
  createOrder(
    principal: Principal,
    input: CreatePurchaseOrderRequest,
  ): Promise<PurchaseOrderRecord>;
  updateOrderStatus(
    principal: Principal,
    id: string,
    input: UpdatePurchaseOrderStatusRequest,
  ): Promise<PurchaseOrderRecord>;
  receiveOrder(
    principal: Principal,
    id: string,
    input: ReceivePurchaseOrderRequest,
  ): Promise<ReceiveResult>;
}

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

/** Exact unit cost times a scaled quantity, rounded half-up to minor units. */
function lineTotalMinor(unitCostMinor: number, scaledQuantity: bigint): number {
  const total = (BigInt(unitCostMinor) * scaledQuantity + 5_000n) / 10_000n;
  if (total > MAX_SAFE) {
    throw validationError('Line total exceeds the supported money range');
  }
  return Number(total);
}

function assertTransition(current: PurchaseOrderStatus, target: 'ordered' | 'cancelled'): void {
  const allowed =
    target === 'ordered' ? current === 'draft' : current === 'draft' || current === 'ordered';
  if (!allowed) {
    throw conflict(`Cannot change a ${current} purchase order to ${target}`);
  }
}

export function createPurchasingService(
  repo: PurchasingRepository,
  products: ProductRepository,
  locations: StockLocationRepository,
): PurchasingService {
  const suppliers = createCrudService(repo.suppliers, 'Supplier');
  const supplierProducts = createSupplierProductService(repo, products);
  const restock = createRestockService(repo, products, locations);

  async function resolveLocationIds(principal: Principal): Promise<string[] | undefined> {
    if (principal.storeIds.length === 0) return undefined;
    const allowed = await locations.listByStoreIds(principal.organizationId, principal.storeIds);
    return allowed.map((location) => location.id);
  }

  async function requireLocation(principal: Principal, locationId: string) {
    const location = await locations.findById(principal.organizationId, locationId);
    const scoped =
      location !== null &&
      (location.storeId === null
        ? principal.storeIds.length === 0
        : hasStoreScope(principal, location.storeId));
    if (!scoped) {
      throw notFound('Stock location not found');
    }
    return location;
  }

  async function requireOrder(principal: Principal, id: string): Promise<PurchaseOrderRecord> {
    const order = await repo.orders.findById(principal.organizationId, id);
    if (!order) {
      throw notFound('Purchase order not found');
    }
    await requireLocation(principal, order.locationId);
    return order;
  }

  return {
    suppliers,
    supplierProducts,
    restock,
    async listOrders(principal, query) {
      const locationIds = await resolveLocationIds(principal);
      const result = await repo.orders.list(
        principal.organizationId,
        { supplierId: query.supplierId, status: query.status, locationIds },
        { limit: query.limit, offset: query.offset },
      );
      return page(result.items, result.total, query);
    },
    getOrder: (principal, id) => requireOrder(principal, id),
    async createOrder(principal, input) {
      const organizationId = principal.organizationId;
      const supplier = await repo.suppliers.findById(organizationId, input.supplierId);
      if (!supplier) {
        throw notFound('Supplier not found');
      }
      await requireLocation(principal, input.locationId);

      const lines = [];
      for (const line of input.lines) {
        const product = await products.findById(organizationId, line.productId);
        if (!product) {
          throw notFound('Product not found');
        }
        const scaledQuantity = parseScaledQuantity(line.quantity);
        lines.push({
          productId: line.productId,
          quantity: line.quantity,
          unitCostMinor: line.unitCostMinor,
          lineTotalMinor: lineTotalMinor(line.unitCostMinor, scaledQuantity),
        });
      }
      const requests =
        input.restockRequestIds && input.restockRequestIds.length > 0
          ? await restock.validateForOrder(
              principal,
              input.locationId,
              input.restockRequestIds,
              input.lines.map((line) => line.productId),
            )
          : [];
      const order = await repo.orders.create({
        organizationId,
        supplierId: input.supplierId,
        locationId: input.locationId,
        notes: input.notes,
        lines,
      });
      if (requests.length > 0) {
        await restock.schedule(order, requests);
      }
      return order;
    },
    async updateOrderStatus(principal, id, input) {
      const organizationId = principal.organizationId;
      const order = await requireOrder(principal, id);
      assertTransition(order.status, input.status);
      const updated = await repo.orders.updateStatus(organizationId, id, input.status);
      if (!updated) {
        throw notFound('Purchase order not found');
      }
      if (input.status === 'cancelled') {
        await restock.release(organizationId, id);
      }
      return updated;
    },
    async receiveOrder(principal, id, input) {
      const organizationId = principal.organizationId;
      const order = await requireOrder(principal, id);
      if (order.status !== 'ordered' && order.status !== 'partially_received') {
        throw conflict('Purchase order is not open for receiving');
      }
      for (const received of input.lines) {
        const line = order.lines.find((candidate) => candidate.id === received.purchaseOrderLineId);
        if (!line) {
          throw validationError('Purchase order line does not belong to this order');
        }
        const remaining =
          parseScaledQuantity(line.quantity) - parseScaledQuantity(line.receivedQuantity);
        if (parseScaledQuantity(received.quantity) > remaining) {
          throw conflict('Received quantity exceeds the outstanding quantity');
        }
      }

      try {
        const result = await repo.orders.receive({
          organizationId,
          purchaseOrderId: id,
          lines: input.lines,
          notes: input.notes,
        });
        if (!result) {
          throw notFound('Purchase order not found');
        }
        if (result.purchaseOrder.status === 'received') {
          await restock.fulfill(organizationId, id);
        }
        return result;
      } catch (error) {
        if (error instanceof ReceiveConflictError) {
          throw conflict(error.message);
        }
        throw error;
      }
    },
  };
}
