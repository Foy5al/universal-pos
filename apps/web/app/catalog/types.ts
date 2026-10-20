import type { Product } from '@pos/contracts';

export interface NewProductInput {
  name: string;
  sku: string;
  barcode?: string | undefined;
  priceMinor: number;
  costMinor?: number | undefined;
  categoryId?: string | undefined;
  brandId?: string | undefined;
  unitId?: string | undefined;
  openingQuantity?: string | undefined;
}

export interface AddProductResult {
  product: Product;
  stockWarning: string | null;
}
