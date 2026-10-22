'use client';

import type { PausedOrder } from '../pausedOrders';
import type { RemovalGuardState } from '../useRemovalGuard';
import { PausedOrdersDialog } from './PausedOrdersDialog';
import { RemovalPasswordDialog } from './RemovalPasswordDialog';

interface HeldSaleDialogsProps {
  pausedOpen: boolean;
  orders: readonly PausedOrder[];
  onResume: (id: string) => void;
  onDiscard: (id: string) => void;
  onClosePaused: () => void;
  guard: RemovalGuardState;
}

export function HeldSaleDialogs({
  pausedOpen,
  orders,
  onResume,
  onDiscard,
  onClosePaused,
  guard,
}: HeldSaleDialogsProps) {
  return (
    <>
      {pausedOpen && (
        <PausedOrdersDialog
          orders={orders}
          onResume={onResume}
          onDiscard={onDiscard}
          onClose={onClosePaused}
        />
      )}
      {guard.pending && (
        <RemovalPasswordDialog
          description={guard.pending.description}
          error={guard.error}
          verifying={guard.verifying}
          onConfirm={(password) => {
            void guard.confirm(password);
          }}
          onCancel={guard.cancel}
        />
      )}
    </>
  );
}
