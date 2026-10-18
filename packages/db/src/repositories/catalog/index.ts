import type { Database } from '../../client';
import {
  createDrizzleBrandRepository,
  InMemoryBrandRepository,
  type BrandRecord,
  type BrandRepository,
} from './brand';
import {
  createDrizzleCategoryRepository,
  InMemoryCategoryRepository,
  type CategoryRecord,
  type CategoryRepository,
} from './category';
import {
  createDrizzleProductRepository,
  InMemoryProductRepository,
  type ProductRecord,
  type ProductRepository,
} from './product';
import {
  createDrizzleUnitRepository,
  InMemoryUnitRepository,
  type UnitRecord,
  type UnitRepository,
} from './unit';

export * from './brand';
export * from './category';
export * from './errors';
export * from './product';
export * from './types';
export * from './unit';

export interface CatalogRepository {
  categories: CategoryRepository;
  brands: BrandRepository;
  units: UnitRepository;
  products: ProductRepository;
}

export interface CatalogSeed {
  categories?: readonly CategoryRecord[];
  brands?: readonly BrandRecord[];
  units?: readonly UnitRecord[];
  products?: readonly ProductRecord[];
}

export class InMemoryCatalogRepository implements CatalogRepository {
  readonly categories: CategoryRepository;
  readonly brands: BrandRepository;
  readonly units: UnitRepository;
  readonly products: ProductRepository;

  constructor(seed: CatalogSeed = {}) {
    this.categories = new InMemoryCategoryRepository(seed.categories);
    this.brands = new InMemoryBrandRepository(seed.brands);
    this.units = new InMemoryUnitRepository(seed.units);
    this.products = new InMemoryProductRepository(seed.products);
  }
}

export function createDrizzleCatalogRepository(db: Database): CatalogRepository {
  return {
    categories: createDrizzleCategoryRepository(db),
    brands: createDrizzleBrandRepository(db),
    units: createDrizzleUnitRepository(db),
    products: createDrizzleProductRepository(db),
  };
}
