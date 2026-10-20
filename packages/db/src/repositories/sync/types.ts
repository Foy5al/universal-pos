import type { SyncOperationStatus } from '@pos/contracts';

export interface DeviceRecord {
  id: string;
  organizationId: string;
  storeId: string;
  registerId: string | null;
  name: string;
  platform: string;
  isActive: boolean;
  createdAt: string;
  lastSeenAt: string | null;
  revokedAt: string | null;
}

export interface RegisterDeviceInput {
  id: string;
  organizationId: string;
  storeId: string;
  name: string;
  platform: string;
  registerId?: string | null;
}

export interface SyncOperationRecord {
  sequence: number;
  organizationId: string;
  deviceId: string;
  operationId: string;
  entityId: string;
  entityType: string;
  eventType: string;
  clientSequence: number;
  status: SyncOperationStatus;
  saleId: string | null;
  conflictReason: string | null;
  message: string | null;
  occurredAt: string;
  receivedAt: string;
}

export interface RecordSyncOperationInput {
  organizationId: string;
  deviceId: string;
  operationId: string;
  entityId: string;
  entityType: string;
  eventType: string;
  clientSequence: number;
  status: SyncOperationStatus;
  saleId?: string | null;
  conflictReason?: string | null;
  message?: string | null;
  occurredAt: string;
}

export interface SyncConflictRecord {
  id: string;
  organizationId: string;
  deviceId: string;
  operationId: string;
  entityId: string;
  reason: string;
  details: string | null;
  createdAt: string;
}

export interface RecordSyncConflictInput {
  organizationId: string;
  deviceId: string;
  operationId: string;
  entityId: string;
  reason: string;
  details?: string | null;
}

export interface SyncRepository {
  registerDevice(input: RegisterDeviceInput): Promise<DeviceRecord>;
  findDevice(organizationId: string, id: string): Promise<DeviceRecord | null>;
  listDevices(organizationId: string): Promise<DeviceRecord[]>;
  revokeDevice(organizationId: string, id: string): Promise<DeviceRecord | null>;
  findOperation(organizationId: string, operationId: string): Promise<SyncOperationRecord | null>;
  recordOperation(input: RecordSyncOperationInput): Promise<SyncOperationRecord>;
  listOperationsAfter(
    organizationId: string,
    deviceId: string,
    afterSequence: number,
    limit: number,
  ): Promise<SyncOperationRecord[]>;
  recordConflict(input: RecordSyncConflictInput): Promise<SyncConflictRecord>;
  listConflicts(organizationId: string, limit: number): Promise<SyncConflictRecord[]>;
}

/** A device id may only ever belong to the organization that enrolled it. */
export class DeviceOwnershipConflictError extends Error {
  constructor() {
    super('Device is enrolled in another organization');
    this.name = 'DeviceOwnershipConflictError';
  }
}
