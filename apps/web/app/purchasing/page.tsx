'use client';

import Link from 'next/link';
import { useState } from 'react';

import { PurchaseOrderForm } from './components/PurchaseOrderForm';
import { PurchaseOrdersPanel } from './components/PurchaseOrdersPanel';
import { ReceiveOrderPanel } from './components/ReceiveOrderPanel';
import { SupplierPanel } from './components/SupplierPanel';
import { usePurchasing } from './usePurchasing';

export default function PurchasingPage() {
  const data = usePurchasing();
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const selectedOrder = data.orders.find((order) => order.id === selectedOrderId) ?? null;

  return (
    <main className="mx-auto flex min-h-screen max-w-7xl flex-col gap-4 p-4 lg:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--color-accent)]">
            Universal POS
          </p>
          <h1 className="mt-1 text-2xl font-semibold">Purchasing</h1>
          <p className="text-xs text-[var(--color-muted)]">
            Suppliers, purchase orders and goods receipts.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/pos" className="btn text-sm">
            POS
          </Link>
          <Link href="/catalog" className="btn text-sm">
            Catalog
          </Link>
          <Link href="/inventory" className="btn text-sm">
            Stock
          </Link>
          <Link href="/reports" className="btn text-sm">
            Reports
          </Link>
        </div>
      </header>

      {data.error && (
        <p
          role="alert"
          className="rounded-lg border border-[var(--color-destructive)]/50 p-3 text-sm"
        >
          {data.error}
        </p>
      )}
      {success && (
        <p
          role="status"
          className="rounded-lg border border-[var(--color-accent)]/50 p-3 text-sm text-[var(--color-accent)]"
        >
          {success}
        </p>
      )}

      {data.loading ? (
        <p className="p-8 text-center text-sm text-[var(--color-muted)]">
          Loading purchasing data...
        </p>
      ) : (
        <div className="grid min-h-0 flex-1 items-start gap-4 lg:grid-cols-[420px_1fr]">
          <div className="space-y-4">
            <SupplierPanel
              suppliers={data.suppliers}
              canManage={data.canManage}
              busy={data.busy}
              onCreate={data.addSupplier}
            />
            {data.canManage ? (
              <PurchaseOrderForm
                suppliers={data.suppliers}
                locations={data.locations}
                products={data.products}
                busy={data.busy}
                onCreate={async (input) => {
                  setSuccess(null);
                  const order = await data.addOrder(input);
                  setSuccess(`Draft purchase order ${order.id.slice(0, 8)} created.`);
                  return order;
                }}
              />
            ) : (
              <section className="surface p-4 text-sm text-[var(--color-muted)]">
                Your role can view purchasing records but cannot create orders.
              </section>
            )}
          </div>

          <div className="space-y-4">
            {selectedOrder && (
              <ReceiveOrderPanel
                key={selectedOrder.id}
                order={selectedOrder}
                products={data.products}
                busy={data.busy}
                onReceive={async (input) => {
                  setSuccess(null);
                  const result = await data.receive(selectedOrder.id, input);
                  setSelectedOrderId(null);
                  setSuccess(
                    `Goods receipt ${result.receipt.id.slice(0, 8)} posted. Purchase order is now ${result.purchaseOrder.status.replace('_', ' ')}.`,
                  );
                  return result;
                }}
                onClose={() => setSelectedOrderId(null)}
              />
            )}
            <PurchaseOrdersPanel
              orders={data.orders}
              products={data.products}
              suppliers={data.suppliers}
              locations={data.locations}
              busy={data.busy}
              canManage={data.canManage}
              selectedOrderId={selectedOrderId}
              onStatus={data.changeStatus}
              onReceive={(order) => {
                setSuccess(null);
                setSelectedOrderId(order.id);
              }}
            />
          </div>
        </div>
      )}
    </main>
  );
}
