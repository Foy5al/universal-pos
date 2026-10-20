'use client';

import type { LocalSale } from '@pos/offline';

import { formatMinor } from '../../lib/money';

interface ProvisionalReceiptViewProps {
  sale: LocalSale;
  syncing: boolean;
  onNewSale: () => void;
  onRefresh: () => void;
}

const STATUS_TEXT: Record<LocalSale['status'], string> = {
  local_pending: 'Saved on this till - waiting to sync',
  server_accepted: 'Synced to the server',
  requires_review: 'Needs manager review after sync',
  rejected: 'Rejected by the server - keep this receipt',
};

export function ProvisionalReceiptView({
  sale,
  syncing,
  onNewSale,
  onRefresh,
}: ProvisionalReceiptViewProps) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4">
      <div className="receipt rounded-lg bg-white p-6 text-black shadow-xl">
        <header className="border-b border-dashed border-black/30 pb-3 text-center">
          <h2 className="text-lg font-bold">Universal POS</h2>
          <p className="text-xs">Receipt {sale.serverSaleNumber ?? sale.provisionalNumber}</p>
          {!sale.serverSaleNumber && (
            <p className="text-[10px] font-semibold uppercase">Provisional - not yet synced</p>
          )}
          <p className="text-xs">{new Date(sale.occurredAt).toLocaleString()}</p>
        </header>

        <table className="mt-3 w-full text-xs">
          <thead>
            <tr className="border-b border-black/20 text-left">
              <th className="py-1">Item</th>
              <th className="py-1 text-right">Qty</th>
              <th className="py-1 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {sale.lines.map((line) => (
              <tr key={line.productId}>
                <td className="py-1 pr-2">
                  {line.name}
                  <span className="block text-[10px] text-black/60">{line.sku}</span>
                </td>
                <td className="py-1 text-right align-top">{line.quantity}</td>
                <td className="py-1 text-right align-top">{formatMinor(line.lineTotalMinor)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <dl className="mt-3 space-y-1 border-t border-dashed border-black/30 pt-3 text-xs">
          <div className="flex justify-between">
            <dt>Subtotal</dt>
            <dd>{formatMinor(sale.subtotalMinor)}</dd>
          </div>
          <div className="flex justify-between font-bold">
            <dt>Total</dt>
            <dd>{formatMinor(sale.totalMinor)}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Cash</dt>
            <dd>{formatMinor(sale.tenderedMinor)}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Change</dt>
            <dd>{formatMinor(sale.changeMinor)}</dd>
          </div>
        </dl>

        <p className="mt-4 text-center text-[10px] text-black/60">
          Thank you. Keep this receipt for returns and exchanges.
        </p>
      </div>

      <p
        role="status"
        className={`surface p-3 text-sm ${
          sale.status === 'rejected' || sale.status === 'requires_review'
            ? 'text-[var(--color-destructive)]'
            : ''
        }`}
      >
        {STATUS_TEXT[sale.status]}
        {sale.conflictReason ? ` (${sale.conflictReason.replace(/_/g, ' ')})` : ''}
      </p>

      <div className="no-print flex gap-3">
        <button type="button" className="btn flex-1" onClick={() => window.print()}>
          Print receipt
        </button>
        <button
          type="button"
          className="btn flex-1"
          onClick={onRefresh}
          disabled={syncing || sale.status === 'server_accepted'}
        >
          {syncing ? 'Syncing...' : 'Check sync'}
        </button>
        <button type="button" className="btn btn-accent flex-1" onClick={onNewSale}>
          New sale
        </button>
      </div>
    </div>
  );
}
