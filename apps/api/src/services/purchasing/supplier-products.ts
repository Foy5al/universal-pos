import {
  page,
  type AddSupplierProductRequest,
  type Page,
  type Principal,
  type SupplierProductListQuery,
} from '@pos/contracts';
import type { ProductRepository, PurchasingRepository, SupplierProductRecord } from '@pos/db';

import { notFound } from '../../core/errors';

export interface SupplierProductService {
  list(
    principal: Principal,
    supplierId: string,
    query: SupplierProductListQuery,
  ): Promise<Page<SupplierProductRecord>>;
  add(
    principal: Principal,
    supplierId: string,
    input: AddSupplierProductRequest,
  ): Promise<SupplierProductRecord>;
  remove(principal: Principal, supplierId: string, productId: string): Promise<void>;
}

export function createSupplierProductService(
  repo: PurchasingRepository,
  products: ProductRepository,
): SupplierProductService {
  async function requireSupplier(principal: Principal, supplierId: string): Promise<void> {
    const supplier = await repo.suppliers.findById(principal.organizationId, supplierId);
    if (!supplier) {
      throw notFound('Supplier not found');
    }
  }

  return {
    async list(principal, supplierId, query) {
      await requireSupplier(principal, supplierId);
      const result = await repo.supplierProducts.list(principal.organizationId, supplierId, {
        limit: query.limit,
        offset: query.offset,
      });
      return page(result.items, result.total, query);
    },
    async add(principal, supplierId, input) {
      await requireSupplier(principal, supplierId);
      const product = await products.findById(principal.organizationId, input.productId);
      if (!product) {
        throw notFound('Product not found');
      }
      return repo.supplierProducts.upsert({
        organizationId: principal.organizationId,
        supplierId,
        productId: input.productId,
        supplierSku: input.supplierSku,
        unitCostMinor: input.unitCostMinor,
        isActive: input.isActive,
      });
    },
    async remove(principal, supplierId, productId) {
      await requireSupplier(principal, supplierId);
      const removed = await repo.supplierProducts.remove(
        principal.organizationId,
        supplierId,
        productId,
      );
      if (!removed) {
        throw notFound('Supplier product not found');
      }
    },
  };
}
