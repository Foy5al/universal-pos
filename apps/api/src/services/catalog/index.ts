import type {
  CreateBrandRequest,
  CreateCategoryRequest,
  CreateProductRequest,
  CreateUnitRequest,
  UpdateBrandRequest,
  UpdateCategoryRequest,
  UpdateProductRequest,
  UpdateUnitRequest,
} from '@pos/contracts';
import type {
  BrandRecord,
  CatalogRepository,
  CategoryRecord,
  ProductRecord,
  UnitRecord,
} from '@pos/db';

import { createCrudService, type CrudService } from './crud';
import { createProductService } from './product';

export interface CatalogService {
  categories: CrudService<CategoryRecord, CreateCategoryRequest, UpdateCategoryRequest>;
  brands: CrudService<BrandRecord, CreateBrandRequest, UpdateBrandRequest>;
  units: CrudService<UnitRecord, CreateUnitRequest, UpdateUnitRequest>;
  products: CrudService<ProductRecord, CreateProductRequest, UpdateProductRequest>;
}

export function createCatalogService(repo: CatalogRepository): CatalogService {
  return {
    categories: createCrudService(repo.categories, 'Category'),
    brands: createCrudService(repo.brands, 'Brand'),
    units: createCrudService(repo.units, 'Unit'),
    products: createProductService(repo.products, repo),
  };
}

export * from './crud';
