import {
  page,
  type CreateRefundRequest,
  type CreateSaleRequest,
  type Page,
  type Refund,
  type SaleListQuery,
} from '@pos/contracts';
import {
  parseScaledQuantity,
  type ProductRepository,
  type RefundRepository,
  type RegisterShiftRepository,
  type SaleRecord,
  type SalesRepository,
  type StockLocationRepository,
} from '@pos/db';

import { conflict, notFound, validationError } from '../../core/errors';

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);
const QUANTITY_FACTOR = 10_000n;

export interface SalesService {
  list(organizationId: string, query: SaleListQuery): Promise<Page<SaleRecord>>;
  get(organizationId: string, id: string): Promise<SaleRecord>;
  create(organizationId: string, userId: string, input: CreateSaleRequest): Promise<SaleRecord>;
  refund(
    organizationId: string,
    userId: string,
    saleId: string,
    input: CreateRefundRequest,
  ): Promise<Refund>;
}

/** Exact unit price times a scaled quantity, rounded half-up to minor units. */
function lineTotalMinor(unitPriceMinor: number, scaledQuantity: bigint): number {
  const total = (BigInt(unitPriceMinor) * scaledQuantity + 5_000n) / QUANTITY_FACTOR;
  if (total > MAX_SAFE) {
    throw validationError('Line total exceeds the supported money range');
  }
  return Number(total);
}

export interface SalesServiceOptions {
  currency?: string;
}

export function createSalesService(
  repo: SalesRepository,
  products: ProductRepository,
  locations: StockLocationRepository,
  registerShifts: RegisterShiftRepository,
  refunds: RefundRepository,
  options: SalesServiceOptions = {},
): SalesService {
  const currency = options.currency ?? 'BDT';

  async function requireSale(organizationId: string, id: string): Promise<SaleRecord> {
    const sale = await repo.sales.findById(organizationId, id);
    if (!sale) {
      throw notFound('Sale not found');
    }
    return sale;
  }

  return {
    async list(organizationId, query) {
      const result = await repo.sales.list(
        organizationId,
        { locationId: query.locationId },
        { limit: query.limit, offset: query.offset },
      );
      return page(result.items, result.total, query);
    },
    get: (organizationId, id) => requireSale(organizationId, id),
    async create(organizationId, userId, input) {
      const location = await locations.findById(organizationId, input.locationId);
      if (!location || !location.isActive) {
        throw notFound('Stock location not found');
      }

      const shift = await registerShifts.findById(organizationId, input.registerShiftId);
      if (!shift) {
        throw notFound('Register shift not found');
      }
      if (shift.status !== 'open') {
        throw conflict('Register shift is closed');
      }
      if (!location.storeId || shift.storeId !== location.storeId) {
        throw validationError('Register shift does not belong to the selling location');
      }

      const lines = [];
      let subtotalMinor = 0;
      for (const line of input.lines) {
        const product = await products.findById(organizationId, line.productId);
        if (!product || !product.isActive) {
          throw notFound('Product not found');
        }
        const total = lineTotalMinor(product.priceMinor, parseScaledQuantity(line.quantity));
        subtotalMinor += total;
        if (!Number.isSafeInteger(subtotalMinor)) {
          throw validationError('Sale total exceeds the supported money range');
        }
        lines.push({
          productId: product.id,
          sku: product.sku,
          name: product.name,
          quantity: line.quantity,
          unitPriceMinor: product.priceMinor,
          lineTotalMinor: total,
        });
      }

      let paidMinor = 0;
      for (const payment of input.payments) {
        paidMinor += payment.tenderedMinor;
        if (!Number.isSafeInteger(paidMinor)) {
          throw validationError('Payment total exceeds the supported money range');
        }
      }
      if (paidMinor < subtotalMinor) {
        throw validationError('Payment is less than the sale total');
      }

      try {
        return await repo.sales.create({
          organizationId,
          locationId: input.locationId,
          operationId: input.operationId,
          registerShiftId: shift.id,
          customerName: input.customerName,
          currency,
          subtotalMinor,
          totalMinor: subtotalMinor,
          paidMinor,
          changeMinor: paidMinor - subtotalMinor,
          createdBy: userId,
          lines,
          payments: input.payments.map((payment) => ({
            method: payment.method,
            amountMinor: payment.tenderedMinor,
          })),
        });
      } catch (error) {
        if (error instanceof Error && error.name === 'InsufficientStockError') {
          throw conflict('Insufficient stock for the requested quantity');
        }
        if (error instanceof Error && error.name === 'RegisterShiftNotOpenError') {
          throw conflict('Register shift is closed');
        }
        throw error;
      }
    },
    async refund(organizationId, userId, saleId, input) {
      const existing = await refunds.findByOperationId(organizationId, input.operationId);
      if (existing) {
        return existing;
      }

      const sale = await requireSale(organizationId, saleId);
      if (sale.status !== 'completed') {
        throw conflict('Sale is not refundable');
      }
      if (await refunds.findBySaleId(organizationId, sale.id)) {
        throw conflict('Sale has already been refunded');
      }

      const shift = await registerShifts.findById(organizationId, input.registerShiftId);
      if (!shift) {
        throw notFound('Register shift not found');
      }
      if (shift.status !== 'open') {
        throw conflict('Register shift is closed');
      }
      const location = await locations.findById(organizationId, sale.locationId);
      if (!location || !location.storeId || shift.storeId !== location.storeId) {
        throw validationError('Register shift does not belong to the selling location');
      }

      try {
        return await refunds.create({
          organizationId,
          saleId: sale.id,
          locationId: sale.locationId,
          registerShiftId: shift.id,
          operationId: input.operationId,
          amountMinor: sale.totalMinor,
          reason: input.reason,
          createdBy: userId,
          lines: sale.lines.map((line) => ({
            productId: line.productId,
            sku: line.sku,
            name: line.name,
            quantity: line.quantity,
            unitPriceMinor: line.unitPriceMinor,
            lineTotalMinor: line.lineTotalMinor,
          })),
        });
      } catch (error) {
        if (error instanceof Error && error.name === 'SaleAlreadyRefundedError') {
          throw conflict('Sale has already been refunded');
        }
        if (error instanceof Error && error.name === 'SaleNotRefundableError') {
          throw conflict('Sale is not refundable');
        }
        if (error instanceof Error && error.name === 'RegisterShiftNotOpenError') {
          throw conflict('Register shift is closed');
        }
        throw error;
      }
    },
  };
}
