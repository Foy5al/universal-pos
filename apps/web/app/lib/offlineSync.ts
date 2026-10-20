'use client';

import { createOfflineDatabase, type PosOfflineDatabase, type SyncTransport } from '@pos/offline';

import { pullSync, pushSync } from './api';

let database: PosOfflineDatabase | null = null;

export function offlineDatabase(): PosOfflineDatabase {
  database ??= createOfflineDatabase();
  return database;
}

export const apiSyncTransport: SyncTransport = {
  push: (request) => pushSync(request),
  pull: async (query) => pullSync(query),
};

/** Catalog/stock snapshots are cleared on sign-out; sales and outbox rows are not. */
export async function clearOfflineCatalog(): Promise<void> {
  const db = offlineDatabase();
  await db.products.clear();
  await db.balances.clear();
}
