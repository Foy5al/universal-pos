import type { CreateProductRequest, UpdateProductRequest } from '@pos/contracts';
import type {
  BrandRepository,
  CategoryRepository,
  ProductRecord,
  ProductRepository,
  UnitRepository,
} from '@pos/db';

import { validationError } from '../../core/errors';
import { createCrudService, type CrudService } from './crud';

interface CatalogReferenceRepositories {
  categories: CategoryRepository;
  brands: BrandRepository;
  units: UnitRepository;
}

export function createProductService(
  repo: ProductRepository,
  refs: CatalogReferenceRepositories,
): CrudService<ProductRecord, CreateProductRequest, UpdateProductRequest> {
  const base = createCrudService<ProductRecord, CreateProductRequest, UpdateProductRequest>(
    repo,
    'Product',
  );

  /**
   * Cross-entity references must resolve inside the caller organization.
   * Repositories scope by organizationId, so a foreign id resolves to null.
   */
  async function assertReferences(
    organizationId: string,
    input: Pick<CreateProductRequest, 'categoryId' | 'brandId' | 'unitId'>,
  ): Promise<void> {
    if (input.categoryId && !(await refs.categories.findById(organizationId, input.categoryId))) {
      throw validationError('Category not found in organization');
    }
    if (input.brandId && !(await refs.brands.findById(organizationId, input.brandId))) {
      throw validationError('Brand not found in organization');
    }
    if (input.unitId && !(await refs.units.findById(organizationId, input.unitId))) {
      throw validationError('Unit not found in organization');
    }
  }

  return {
    list: base.list,
    get: base.get,
    async create(organizationId, input) {
      await assertReferences(organizationId, input);
      return base.create(organizationId, input);
    },
    async update(organizationId, id, input) {
      await assertReferences(organizationId, input);
      return base.update(organizationId, id, input);
    },
  };
}
