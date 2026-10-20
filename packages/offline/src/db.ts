import Dexie, { type Table } from 'dexie';

import type {
  CachedBalance,
  CachedProduct,
  CounterRecord,
  DeviceIdentity,
  LocalSale,
  OutboxEvent,
  StateRecord,
} from './types';

const DEVICE_KEY = 'device.identity';
export const DEFAULT_DEVICE_NAME = 'Web till';

/**
 * Local durable store. Version 1 is deliberately append-only for sales and
 * outbox rows; acknowledged rows are retained for reconciliation (ADR-0004).
 */
export class PosOfflineDatabase extends Dexie {
  products!: Table<CachedProduct, string>;
  balances!: Table<CachedBalance, string>;
  localSales!: Table<LocalSale, string>;
  outbox!: Table<OutboxEvent, string>;
  state!: Table<StateRecord, string>;
  counters!: Table<CounterRecord, string>;

  constructor(name = 'pos.offline') {
    super(name);
    this.version(1).stores({
      products: 'id, sku, barcode',
      balances: 'id, locationId, productId',
      localSales: 'id, status, occurredAt',
      outbox: 'operationId, status, nextAttemptAt',
      state: 'key',
      counters: 'key',
    });
  }
}

export function createOfflineDatabase(name = 'pos.offline'): PosOfflineDatabase {
  return new PosOfflineDatabase(name);
}

export function newUuid(): string {
  return globalThis.crypto.randomUUID();
}

export async function readDeviceIdentity(db: PosOfflineDatabase): Promise<DeviceIdentity | null> {
  const record = await db.state.get(DEVICE_KEY);
  if (!record) return null;
  try {
    return JSON.parse(record.value) as DeviceIdentity;
  } catch {
    return null;
  }
}

export async function saveDeviceIdentity(
  db: PosOfflineDatabase,
  identity: DeviceIdentity,
): Promise<void> {
  await db.state.put({ key: DEVICE_KEY, value: JSON.stringify(identity) });
}

/** Stable per-browser terminal id; enrollment happens on the first online sync. */
export async function getOrCreateDeviceIdentity(
  db: PosOfflineDatabase,
  options: { name?: string; platform?: string } = {},
): Promise<DeviceIdentity> {
  const existing = await readDeviceIdentity(db);
  if (existing) return existing;
  const identity: DeviceIdentity = {
    deviceId: newUuid(),
    name: options.name ?? DEFAULT_DEVICE_NAME,
    platform: options.platform ?? 'web',
  };
  await saveDeviceIdentity(db, identity);
  return identity;
}

export async function readSyncCursor(db: PosOfflineDatabase): Promise<number> {
  const record = await db.state.get('sync.cursor');
  const cursor = record ? Number(record.value) : 0;
  return Number.isFinite(cursor) && cursor >= 0 ? cursor : 0;
}

export async function writeSyncCursor(
  db: PosOfflineDatabase,
  cursor: number,
  syncedAt: string,
): Promise<void> {
  await db.state.bulkPut([
    { key: 'sync.cursor', value: String(cursor) },
    { key: 'sync.lastSyncedAt', value: syncedAt },
  ]);
}

export async function readLastSyncedAt(db: PosOfflineDatabase): Promise<string | null> {
  const record = await db.state.get('sync.lastSyncedAt');
  return record?.value ?? null;
}
