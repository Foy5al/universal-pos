import { z } from 'zod';

const nameSchema = z.string().trim().min(1).max(160);
const skuSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9._-]*$/,
    'SKU must start alphanumeric and use letters, digits, . _ -',
  );
const barcodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[0-9A-Za-z._-]+$/, 'Barcode must be alphanumeric');
const moneyMinorSchema = z.number().int().min(0).max(1_000_000_000_000);

export const categorySchema = z.object({
  id: z.uuid(),
  organizationId: z.uuid(),
  parentId: z.uuid().nullable(),
  name: z.string(),
  isActive: z.boolean(),
  createdAt: z.string(),
});

export type Category = z.infer<typeof categorySchema>;

export const createCategoryRequestSchema = z.object({
  name: nameSchema,
  parentId: z.uuid().optional(),
  isActive: z.boolean().optional(),
});

export type CreateCategoryRequest = z.infer<typeof createCategoryRequestSchema>;

export const updateCategoryRequestSchema = createCategoryRequestSchema.partial();

export type UpdateCategoryRequest = z.infer<typeof updateCategoryRequestSchema>;

export const brandSchema = z.object({
  id: z.uuid(),
  organizationId: z.uuid(),
  name: z.string(),
  isActive: z.boolean(),
  createdAt: z.string(),
});

export type Brand = z.infer<typeof brandSchema>;

export const createBrandRequestSchema = z.object({
  name: nameSchema,
  isActive: z.boolean().optional(),
});

export type CreateBrandRequest = z.infer<typeof createBrandRequestSchema>;

export const updateBrandRequestSchema = createBrandRequestSchema.partial();

export type UpdateBrandRequest = z.infer<typeof updateBrandRequestSchema>;

export const unitSchema = z.object({
  id: z.uuid(),
  organizationId: z.uuid(),
  name: z.string(),
  abbreviation: z.string(),
  isActive: z.boolean(),
  createdAt: z.string(),
});

export type Unit = z.infer<typeof unitSchema>;

export const createUnitRequestSchema = z.object({
  name: nameSchema,
  abbreviation: z.string().trim().min(1).max(16),
  isActive: z.boolean().optional(),
});

export type CreateUnitRequest = z.infer<typeof createUnitRequestSchema>;

export const updateUnitRequestSchema = createUnitRequestSchema.partial();

export type UpdateUnitRequest = z.infer<typeof updateUnitRequestSchema>;

export const productSchema = z.object({
  id: z.uuid(),
  organizationId: z.uuid(),
  sku: z.string(),
  name: z.string(),
  categoryId: z.uuid().nullable(),
  brandId: z.uuid().nullable(),
  unitId: z.uuid().nullable(),
  barcode: z.string().nullable(),
  priceMinor: z.number().int(),
  costMinor: z.number().int().nullable(),
  isActive: z.boolean(),
  createdAt: z.string(),
});

export type Product = z.infer<typeof productSchema>;

export const createProductRequestSchema = z.object({
  sku: skuSchema,
  name: nameSchema,
  priceMinor: moneyMinorSchema,
  costMinor: moneyMinorSchema.optional(),
  barcode: barcodeSchema.optional(),
  categoryId: z.uuid().optional(),
  brandId: z.uuid().optional(),
  unitId: z.uuid().optional(),
  isActive: z.boolean().optional(),
});

export type CreateProductRequest = z.infer<typeof createProductRequestSchema>;

export const updateProductRequestSchema = createProductRequestSchema.partial();

export type UpdateProductRequest = z.infer<typeof updateProductRequestSchema>;
