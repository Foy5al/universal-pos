import {
  page,
  type CreateRefundRequest,
  type CreateSaleRequest,
  type OfflineSalePayload,
  type Page,
  type Refund,
  type SaleListQuery,
} from '@pos/contracts';
import {
  type ProductRepository,
  type RefundRepository,
  type RegisterShiftRecord,
  type RegisterShiftRepository,
  type SaleRecord,
  type SalesRepository,
  type StockLocationRepository,
} from '@pos/db';

import { conflict, notFound, validationError } from '../../core/errors';
import { lineTotalMinor, sumSubtotalMinor, sumTenderedMinor } from './pricing';

export interface SalesService {
  list(organizationId: string, query: SaleListQuery): Promise<Page<SaleRecord>>;
  get(organizationId: string, id: string): Promise<SaleRecord>;
  findByOperationId(organizationId: string, operationId: string): Promise<SaleRecord | null>;
  create(organizationId: string, userId: string, input: CreateSaleRequest): Promise<SaleRecord>;
  /** Posts a sale whose line prices were captured on an offline terminal. */
  createFromDevice(
    organizationId: string,
    userId: string,
    input: Omit<OfflineSalePayload, 'provisionalNumber'> & { operationId: string },
  ): Promise<SaleRecord>;
  refund(
    organizationId: string,
    userId: string,
    saleId: string,
    input: CreateRefundRequest,
  ): Promise<Refund>;
}

/** Maps stock/shift repository failures onto stable API errors. */
function rethrowPostingError(error: unknown): never {
  if (error instanceof Error && error.name === 'InsufficientStockError') {
    throw conflict('Insufficient stock for the requested quantity');
  }
  if (error instanceof Error && error.name === 'RegisterShiftNotOpenError') {
    throw conflict('Register shift is closed');
  }
  throw error;
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

  async function requireSaleContext(
    organizationId: string,
    locationId: string,
    registerShiftId: string,
  ): Promise<RegisterShiftRecord> {
    const location = await locations.findById(organizationId, locationId);
    if (!location || !location.isActive) {
      throw notFound('Stock location not found');
    }
    const shift = await registerShifts.findById(organizationId, registerShiftId);
    if (!shift) {
      throw notFound('Register shift not found');
    }
    if (shift.status !== 'open') {
      throw conflict('Register shift is closed');
    }
    if (!location.storeId || shift.storeId !== location.storeId) {
      throw validationError('Register shift does not belong to the selling location');
    }
    return shift;
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
    findByOperationId: (organizationId, operationId) =>
      repo.sales.findByOperationId(organizationId, operationId),
    async create(organizationId, userId, input) {
      const shift = await requireSaleContext(
        organizationId,
        input.locationId,
        input.registerShiftId,
      );

      const lines = [];
      for (const line of input.lines) {
        const product = await products.findById(organizationId, line.productId);
        if (!product || !product.isActive) {
          throw notFound('Product not found');
        }
        lines.push({
          productId: product.id,
          sku: product.sku,
          name: product.name,
          quantity: line.quantity,
          unitPriceMinor: product.priceMinor,
          lineTotalMinor: lineTotalMinor(product.priceMinor, line.quantity),
        });
      }

      const subtotalMinor = sumSubtotalMinor(lines.map((line) => line.lineTotalMinor));
      const paidMinor = sumTenderedMinor(input.payments);
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
        rethrowPostingError(error);
      }
    },
    async createFromDevice(organizationId, userId, input) {
      const shift = await requireSaleContext(
        organizationId,
        input.locationId,
        input.registerShiftId,
      );

      const lines = [];
      for (const line of input.lines) {
        const product = await products.findById(organizationId, line.productId);
        if (!product || !product.isActive) {
          throw notFound('Product not found');
        }
        lines.push({
          productId: product.id,
          sku: product.sku,
          name: product.name,
          quantity: line.quantity,
          unitPriceMinor: line.unitPriceMinor,
          lineTotalMinor: lineTotalMinor(line.unitPriceMinor, line.quantity),
        });
      }

      const subtotalMinor = sumSubtotalMinor(lines.map((line) => line.lineTotalMinor));
      const paidMinor = sumTenderedMinor(input.payments);
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
        rethrowPostingError(error);
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
