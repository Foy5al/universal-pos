'use client';

import type { Sale } from '@pos/contracts';
import type { LocalSale } from '@pos/offline';

import { ProvisionalReceiptView } from './ProvisionalReceiptView';
import { ReceiptView } from './ReceiptView';

interface CheckoutResultProps {
  serverSale: Sale | null;
  localSale: LocalSale | null;
  shiftId?: string | undefined;
  syncing: boolean;
  onNewSale: () => void;
  onRefunded: () => Promise<void> | void;
  onRefreshLocal: () => void;
}

export function CheckoutResult({
  serverSale,
  localSale,
  shiftId,
  syncing,
  onNewSale,
  onRefunded,
  onRefreshLocal,
}: CheckoutResultProps) {
  if (serverSale) {
    return (
      <ReceiptView
        sale={serverSale}
        shiftId={shiftId}
        onNewSale={onNewSale}
        onRefunded={onRefunded}
      />
    );
  }
  if (localSale) {
    return (
      <ProvisionalReceiptView
        sale={localSale}
        syncing={syncing}
        onNewSale={onNewSale}
        onRefresh={onRefreshLocal}
      />
    );
  }
  return null;
}
