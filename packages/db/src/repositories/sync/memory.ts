import { randomUUID } from 'node:crypto';

import {
  DeviceOwnershipConflictError,
  type DeviceRecord,
  type RecordSyncConflictInput,
  type RecordSyncOperationInput,
  type RegisterDeviceInput,
  type ResolveSyncConflictInput,
  type ResolveSyncOperationInput,
  type SyncConflictRecord,
  type SyncOperationRecord,
  type SyncRepository,
} from './types';

export interface SyncRepositorySeed {
  devices?: readonly DeviceRecord[];
  operations?: readonly SyncOperationRecord[];
  conflicts?: readonly SyncConflictRecord[];
}

export class InMemorySyncRepository implements SyncRepository {
  private readonly devices: DeviceRecord[];
  private readonly operations: SyncOperationRecord[];
  private readonly conflicts: SyncConflictRecord[];
  private sequence: number;

  constructor(seed: SyncRepositorySeed = {}) {
    this.devices = (seed.devices ?? []).map((device) => ({ ...device }));
    this.operations = (seed.operations ?? []).map((operation) => ({ ...operation }));
    this.conflicts = (seed.conflicts ?? []).map((conflict) => ({ ...conflict }));
    this.sequence = this.operations.reduce(
      (max, operation) => Math.max(max, operation.sequence),
      0,
    );
  }

  async registerDevice(input: RegisterDeviceInput): Promise<DeviceRecord> {
    const now = new Date().toISOString();
    const existing = this.devices.find((device) => device.id === input.id);
    if (existing) {
      if (existing.organizationId !== input.organizationId) {
        throw new DeviceOwnershipConflictError();
      }
      existing.name = input.name;
      existing.platform = input.platform;
      existing.storeId = input.storeId;
      existing.registerId = input.registerId ?? existing.registerId;
      existing.lastSeenAt = now;
      return { ...existing };
    }

    const device: DeviceRecord = {
      id: input.id,
      organizationId: input.organizationId,
      storeId: input.storeId,
      registerId: input.registerId ?? null,
      name: input.name,
      platform: input.platform,
      isActive: true,
      createdAt: now,
      lastSeenAt: now,
      revokedAt: null,
    };
    this.devices.push(device);
    return { ...device };
  }

  async findDevice(organizationId: string, id: string): Promise<DeviceRecord | null> {
    const device = this.devices.find(
      (record) => record.organizationId === organizationId && record.id === id,
    );
    return device ? { ...device } : null;
  }

  async listDevices(organizationId: string): Promise<DeviceRecord[]> {
    return this.devices
      .filter((device) => device.organizationId === organizationId)
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
      .map((device) => ({ ...device }));
  }

  async revokeDevice(organizationId: string, id: string): Promise<DeviceRecord | null> {
    const device = this.devices.find(
      (record) => record.organizationId === organizationId && record.id === id,
    );
    if (!device) return null;
    if (!device.revokedAt) {
      device.revokedAt = new Date().toISOString();
      device.isActive = false;
    }
    return { ...device };
  }

  async findOperation(
    organizationId: string,
    operationId: string,
  ): Promise<SyncOperationRecord | null> {
    const operation = this.operations.find(
      (record) => record.organizationId === organizationId && record.operationId === operationId,
    );
    return operation ? { ...operation } : null;
  }

  async recordOperation(input: RecordSyncOperationInput): Promise<SyncOperationRecord> {
    const existing = await this.findOperation(input.organizationId, input.operationId);
    if (existing) return existing;

    const operation: SyncOperationRecord = {
      sequence: ++this.sequence,
      organizationId: input.organizationId,
      deviceId: input.deviceId,
      operationId: input.operationId,
      entityId: input.entityId,
      entityType: input.entityType,
      eventType: input.eventType,
      clientSequence: input.clientSequence,
      status: input.status,
      saleId: input.saleId ?? null,
      conflictReason: input.conflictReason ?? null,
      message: input.message ?? null,
      occurredAt: input.occurredAt,
      receivedAt: new Date().toISOString(),
    };
    this.operations.push(operation);
    return { ...operation };
  }

  async listOperationsAfter(
    organizationId: string,
    deviceId: string,
    afterSequence: number,
    limit: number,
  ): Promise<SyncOperationRecord[]> {
    return this.operations
      .filter(
        (operation) =>
          operation.organizationId === organizationId &&
          operation.deviceId === deviceId &&
          operation.sequence > afterSequence,
      )
      .sort((a, b) => a.sequence - b.sequence)
      .slice(0, limit)
      .map((operation) => ({ ...operation }));
  }

  async recordConflict(input: RecordSyncConflictInput): Promise<SyncConflictRecord> {
    const existing = this.conflicts.find(
      (conflict) =>
        conflict.organizationId === input.organizationId &&
        conflict.operationId === input.operationId,
    );
    if (existing) return { ...existing };

    const conflict: SyncConflictRecord = {
      id: randomUUID(),
      organizationId: input.organizationId,
      deviceId: input.deviceId,
      operationId: input.operationId,
      entityId: input.entityId,
      cashierId: input.cashierId ?? null,
      reason: input.reason,
      details: input.details ?? null,
      payload: input.payload ?? null,
      status: 'open',
      resolution: null,
      resolutionNote: null,
      resolvedAt: null,
      resolvedBy: null,
      createdAt: new Date().toISOString(),
    };
    this.conflicts.push(conflict);
    return { ...conflict };
  }

  async findConflict(organizationId: string, id: string): Promise<SyncConflictRecord | null> {
    const conflict = this.conflicts.find(
      (record) => record.organizationId === organizationId && record.id === id,
    );
    return conflict ? { ...conflict } : null;
  }

  async listConflicts(organizationId: string, limit: number): Promise<SyncConflictRecord[]> {
    return this.conflicts
      .filter((conflict) => conflict.organizationId === organizationId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
      .slice(0, limit)
      .map((conflict) => ({ ...conflict }));
  }

  async resolveConflict(
    organizationId: string,
    id: string,
    input: ResolveSyncConflictInput,
  ): Promise<SyncConflictRecord | null> {
    const conflict = this.conflicts.find(
      (record) => record.organizationId === organizationId && record.id === id,
    );
    if (!conflict || conflict.status !== 'open') return null;
    conflict.status = 'resolved';
    conflict.resolution = input.resolution;
    conflict.resolutionNote = input.resolutionNote;
    conflict.resolvedAt = input.resolvedAt;
    conflict.resolvedBy = input.resolvedBy;
    return { ...conflict };
  }

  async resolveOperation(
    organizationId: string,
    operationId: string,
    input: ResolveSyncOperationInput,
  ): Promise<SyncOperationRecord | null> {
    const operation = this.operations.find(
      (record) => record.organizationId === organizationId && record.operationId === operationId,
    );
    if (!operation) return null;
    operation.status = input.status;
    operation.saleId = input.saleId ?? operation.saleId;
    operation.conflictReason = input.conflictReason ?? null;
    operation.message = input.message ?? null;
    return { ...operation };
  }
}
