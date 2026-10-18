export interface CatalogListOptions {
  limit: number;
  offset: number;
}

export interface CatalogListResult<T> {
  items: T[];
  total: number;
}
