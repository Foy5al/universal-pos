'use client';

import type { Sale } from '@pos/contracts';

import { formatMinor } from '../../lib/money';
import { RefundForm } from './RefundForm';

interface ReceiptViewProps {
  sale: Sale;
  shiftId?: string | undefined;
  onNewSale: () => void;
  onRefunded: () => Promise<void> | void;
}

export function ReceiptView({ sale, shiftId, onNewSale, onRefunded }: ReceiptViewProps) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4">
      <div className="receipt rounded-lg bg-white p-6 text-black shadow-xl">
        <header className="border-b border-dashed border-black/30 pb-3 text-center">
          <h2 className="text-lg font-bold">Universal POS</h2>
          <p className="text-xs">Receipt {sale.saleNumber}</p>
          <p className="text-xs">{new Date(sale.createdAt).toLocaleString()}</p>
          {sale.customerName && <p className="text-xs">Customer: {sale.customerName}</p>}
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
              <tr key={line.id}>
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
            <dd>{formatMinor(sale.paidMinor)}</dd>
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

      <div className="no-print flex gap-3">
        <button type="button" className="btn flex-1" onClick={() => window.print()}>
          Print receipt
        </button>
        <button type="button" className="btn btn-accent flex-1" onClick={onNewSale}>
          New sale
        </button>
      </div>

      <div className="no-print surface p-3">
        <RefundForm
          saleId={sale.id}
          totalMinor={sale.totalMinor}
          shiftId={shiftId}
          onRefunded={onRefunded}
        />
      </div>
    </div>
  );
}
