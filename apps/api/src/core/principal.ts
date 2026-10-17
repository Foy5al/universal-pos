import type { Principal } from '@pos/contracts';

export type { Principal };

/**
 * An empty `storeIds` means organization-wide scope (e.g. owner/manager).
 * A non-empty list restricts the principal to those stores.
 */
export function hasStoreScope(principal: Principal, storeId: string): boolean {
  return principal.storeIds.length === 0 || principal.storeIds.includes(storeId);
}
