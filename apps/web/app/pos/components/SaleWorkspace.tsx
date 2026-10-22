'use client';

import type { Product } from '@pos/contracts';

import type { CartLine } from '../types';
import { CartPanel } from './CartPanel';
import { ProductGrid } from './ProductGrid';

interface SaleWorkspaceProps {
  products: readonly Product[];
  stockByProduct: ReadonlyMap<string, string>;
  onAdd: (product: Product) => void;
  onRequestRestock?: ((product: Product) => void) | undefined;
  highlightedProductId: string | null;
  lines: readonly CartLine[];
  onChangeQuantity: (productId: string, quantity: string) => void;
  onRemove: (productId: string) => void;
  onClear: () => void;
  onPause: () => void;
  onOpenPaused: () => void;
  pausedCount: number;
  tendered: string;
  onTenderedChange: (value: string) => void;
  onSubmit: () => void;
  submitting: boolean;
  canCheckout: boolean;
}

export function SaleWorkspace({
  products,
  stockByProduct,
  onAdd,
  onRequestRestock,
  highlightedProductId,
  lines,
  onChangeQuantity,
  onRemove,
  onClear,
  onPause,
  onOpenPaused,
  pausedCount,
  tendered,
  onTenderedChange,
  onSubmit,
  submitting,
  canCheckout,
}: SaleWorkspaceProps) {
  return (
    <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[1fr_380px]">
      <section aria-label="Products" className="min-h-0">
        <ProductGrid
          products={products}
          stockByProduct={stockByProduct}
          onAdd={onAdd}
          onRequestRestock={onRequestRestock}
          disabled={false}
          highlightedProductId={highlightedProductId}
        />
      </section>
      <CartPanel
        lines={lines}
        stockByProduct={stockByProduct}
        onChangeQuantity={onChangeQuantity}
        onRemove={onRemove}
        onClear={onClear}
        onPause={onPause}
        onOpenPaused={onOpenPaused}
        pausedCount={pausedCount}
        tendered={tendered}
        onTenderedChange={onTenderedChange}
        onSubmit={onSubmit}
        submitting={submitting}
        canCheckout={canCheckout}
        error={null}
      />
    </div>
  );
}
