'use client';

import type { Sale } from '@pos/contracts';
import type { LocalSale } from '@pos/offline';
import { useState } from 'react';

import { getSale } from '../lib/api';
import { offlineDatabase } from '../lib/offlineSync';

export type Receipt = { kind: 'server'; sale: Sale } | { kind: 'local'; sale: LocalSale };

export function usePosReceipt(sync: () => Promise<void>) {
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  async function showReceipt(local: LocalSale): Promise<void> {
    if (local.serverSaleId) {
      try {
        const server = await getSale(local.serverSaleId);
        setReceipt({ kind: 'server', sale: server });
        return;
      } catch {
        // Keep the local receipt when the canonical sale is not reachable yet.
      }
    }
    setReceipt({ kind: 'local', sale: local });
  }

  async function refreshReceipt(): Promise<void> {
    if (receipt?.kind !== 'local') return;
    await sync();
    const updated = await offlineDatabase().localSales.get(receipt.sale.id);
    if (updated) await showReceipt(updated);
  }

  return { receipt, setReceipt, showReceipt, refreshReceipt };
}
