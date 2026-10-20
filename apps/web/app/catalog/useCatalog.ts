'use client';

import type {
  Brand,
  Category,
  CreateProductRequest,
  Page,
  Product,
  StockBalance,
  StockLocation,
  Unit,
} from '@pos/contracts';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import {
  ApiError,
  clearToken,
  createBrand,
  createProduct,
  createStockAdjustment,
  fetchSession,
  getToken,
  listBalances,
  listBrands,
  listCategories,
  listLocations,
  listProducts,
  listUnits,
} from '../lib/api';
import type { AddProductResult, NewProductInput } from './types';

export function useCatalog(locationId: string) {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [balances, setBalances] = useState<StockBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [brandBusy, setBrandBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [canAdjust, setCanAdjust] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace('/login');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const session = await fetchSession(token);
        if (cancelled) return;
        setCanManage(session.user.permissions.includes('catalog:manage'));
        setCanAdjust(session.user.permissions.includes('inventory:adjust'));
        const [productPage, categoryPage, brandPage, unitPage, locationPage]: [
          Page<Product>,
          Page<Category>,
          Page<Brand>,
          Page<Unit>,
          Page<StockLocation>,
        ] = await Promise.all([
          listProducts(),
          listCategories(),
          listBrands(),
          listUnits(),
          listLocations(),
        ]);
        if (cancelled) return;
        setProducts(productPage.items);
        setCategories(categoryPage.items);
        setBrands(brandPage.items);
        setUnits(unitPage.items);
        setLocations(locationPage.items);
      } catch (cause) {
        if (cause instanceof ApiError && cause.status === 401) {
          clearToken();
          router.replace('/login');
          return;
        }
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'Could not load the catalog');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const refreshBalances = useCallback(async () => {
    if (!locationId) {
      setBalances([]);
      return;
    }
    try {
      const result = await listBalances(locationId);
      setBalances(result.items);
    } catch {
      setBalances([]);
    }
  }, [locationId]);

  useEffect(() => {
    let cancelled = false;
    if (!locationId) {
      setBalances([]);
      return;
    }
    listBalances(locationId)
      .then((result) => {
        if (!cancelled) setBalances(result.items);
      })
      .catch(() => {
        if (!cancelled) setBalances([]);
      });
    return () => {
      cancelled = true;
    };
  }, [locationId]);

  async function addBrand(name: string): Promise<Brand> {
    setBrandBusy(true);
    try {
      const brand = await createBrand({ name });
      setBrands((current) =>
        [...current, brand].sort(
          (left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id),
        ),
      );
      return brand;
    } finally {
      setBrandBusy(false);
    }
  }

  async function addProduct(input: NewProductInput): Promise<AddProductResult> {
    setBusy(true);
    setError(null);
    try {
      const body: CreateProductRequest = {
        name: input.name,
        sku: input.sku,
        priceMinor: input.priceMinor,
        ...(input.barcode ? { barcode: input.barcode } : {}),
        ...(input.costMinor !== undefined ? { costMinor: input.costMinor } : {}),
        ...(input.categoryId ? { categoryId: input.categoryId } : {}),
        ...(input.brandId ? { brandId: input.brandId } : {}),
        ...(input.unitId ? { unitId: input.unitId } : {}),
      };
      const product = await createProduct(body);
      setProducts((current) =>
        [...current, product].sort(
          (left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id),
        ),
      );

      let stockWarning: string | null = null;
      if (input.openingQuantity && locationId) {
        try {
          await createStockAdjustment({
            locationId,
            productId: product.id,
            quantityDelta: input.openingQuantity,
            reason: 'Opening stock',
          });
        } catch (cause) {
          stockWarning =
            cause instanceof Error
              ? `Product saved, but opening stock failed: ${cause.message}`
              : 'Product saved, but opening stock failed.';
        }
      }
      await refreshBalances();
      return { product, stockWarning };
    } finally {
      setBusy(false);
    }
  }

  return {
    products,
    categories,
    brands,
    units,
    locations,
    balances,
    loading,
    busy,
    brandBusy,
    error,
    canManage,
    canAdjust,
    addBrand,
    addProduct,
  };
}
