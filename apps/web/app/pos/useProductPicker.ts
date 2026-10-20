'use client';

import type { Product } from '@pos/contracts';
import type { Dispatch, SetStateAction } from 'react';
import { useMemo } from 'react';

import { isValidQuantity, lineQuantityIssue, nextQuantity, type CartLine } from './types';

interface ProductPickerOptions {
  products: readonly Product[];
  cart: readonly CartLine[];
  setCart: Dispatch<SetStateAction<CartLine[]>>;
  setError: (message: string | null) => void;
  search: string;
  setSearch: (value: string) => void;
  stockByProduct: ReadonlyMap<string, string>;
  onAdd: () => void;
}

export function useProductPicker({
  products,
  cart,
  setCart,
  setError,
  search,
  setSearch,
  stockByProduct,
  onAdd,
}: ProductPickerOptions) {
  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return products;
    return products.filter(
      (product) =>
        product.name.toLowerCase().includes(term) ||
        product.sku.toLowerCase().includes(term) ||
        (product.barcode ?? '').toLowerCase() === term,
    );
  }, [products, search]);

  function addProduct(product: Product) {
    onAdd();
    const existing = cart.find((line) => line.product.id === product.id);
    const quantity =
      existing && isValidQuantity(existing.quantity) ? nextQuantity(existing.quantity) : '1';
    const issue = lineQuantityIssue(quantity, stockByProduct.get(product.id), product.name);
    if (issue) {
      setError(issue);
      return;
    }
    setError(null);
    setCart((current) =>
      existing
        ? current.map((line) => (line.product.id === product.id ? { ...line, quantity } : line))
        : [...current, { product, quantity }],
    );
  }

  function handleScan() {
    const term = search.trim().toLowerCase();
    if (!term) return;
    const match =
      products.find((product) => (product.barcode ?? '').toLowerCase() === term) ??
      products.find((product) => product.sku.toLowerCase() === term) ??
      (filteredProducts.length === 1 ? filteredProducts[0] : undefined);
    if (match) {
      addProduct(match);
      setSearch('');
    }
  }

  return { filteredProducts, addProduct, handleScan };
}
