import type {
  RegisterDeviceRequest,
  SyncConflict,
  SyncEvent,
  SyncPullQuery,
  SyncPullResponse,
  SyncPushRequest,
  SyncPushResponse,
  SyncPushResult,
} from '@pos/contracts';
import {
  DeviceOwnershipConflictError,
  type DeviceRecord,
  type StockLocationRepository,
  type SyncRepository,
} from '@pos/db';

import { AppError, conflict, forbidden, notFound, validationError } from '../../core/errors';
import type { SalesService } from '../sales';

export interface SyncService {
  listDevices(organizationId: string): Promise<DeviceRecord[]>;
  registerDevice(organizationId: string, input: RegisterDeviceRequest): Promise<DeviceRecord>;
  revokeDevice(organizationId: string, id: string): Promise<DeviceRecord>;
  listConflicts(organizationId: string, limit: number): Promise<SyncConflict[]>;
  push(organizationId: string, userId: string, input: SyncPushRequest): Promise<SyncPushResponse>;
  pull(organizationId: string, query: SyncPullQuery): Promise<SyncPullResponse>;
}

function isInsufficientStock(error: AppError): boolean {
  return error.message.toLowerCase().includes('insufficient stock');
}

export function createSyncService(
  repo: SyncRepository,
  sales: SalesService,
  locations: StockLocationRepository,
): SyncService {
  async function requireStore(organizationId: string, locationId: string): Promise<string> {
    const location = await locations.findById(organizationId, locationId);
    if (!location || !location.isActive) {
      throw notFound('Stock location not found');
    }
    if (!location.storeId) {
      throw validationError('Stock location is not attached to a store');
    }
    return location.storeId;
  }

  async function enroll(
    organizationId: string,
    input: RegisterDeviceRequest,
  ): Promise<DeviceRecord> {
    if (!input.storeId) {
      throw validationError('storeId is required to enroll a device');
    }
    const existing = await repo.findDevice(organizationId, input.id);
    if (existing?.revokedAt) {
      throw forbidden('Device is revoked');
    }
    try {
      return await repo.registerDevice({
        id: input.id,
        organizationId,
        storeId: input.storeId,
        name: input.name,
        platform: input.platform,
        registerId: input.registerId ?? null,
      });
    } catch (error) {
      if (error instanceof DeviceOwnershipConflictError) {
        throw conflict('Device is enrolled in another organization');
      }
      throw error;
    }
  }

  async function applyEvent(
    organizationId: string,
    userId: string,
    deviceId: string,
    event: SyncEvent,
  ): Promise<SyncPushResult> {
    const base = { operationId: event.operationId, entityId: event.entityId };
    const recorded = await repo.findOperation(organizationId, event.operationId);
    if (recorded) {
      const sale = recorded.saleId ? await sales.get(organizationId, recorded.saleId) : null;
      return {
        ...base,
        status: recorded.status === 'accepted' ? 'duplicate' : recorded.status,
        sale,
        conflictReason: recorded.conflictReason,
        message: recorded.message,
      };
    }

    // The same operation may already have been posted through the online endpoint.
    const posted = await sales.findByOperationId(organizationId, event.operationId);
    if (posted) {
      await repo.recordOperation({
        organizationId,
        deviceId,
        operationId: event.operationId,
        entityId: event.entityId,
        entityType: event.entityType,
        eventType: event.eventType,
        clientSequence: event.clientSequence,
        status: 'accepted',
        saleId: posted.id,
        occurredAt: event.occurredAt,
      });
      return { ...base, status: 'duplicate', sale: posted, conflictReason: null, message: null };
    }

    try {
      const sale = await sales.createFromDevice(organizationId, userId, {
        operationId: event.operationId,
        locationId: event.payload.locationId,
        registerShiftId: event.payload.registerShiftId,
        customerName: event.payload.customerName,
        lines: event.payload.lines,
        payments: event.payload.payments,
      });
      await repo.recordOperation({
        organizationId,
        deviceId,
        operationId: event.operationId,
        entityId: event.entityId,
        entityType: event.entityType,
        eventType: event.eventType,
        clientSequence: event.clientSequence,
        status: 'accepted',
        saleId: sale.id,
        occurredAt: event.occurredAt,
      });
      return { ...base, status: 'accepted', sale, conflictReason: null, message: null };
    } catch (error) {
      if (error instanceof AppError && error.code === 'conflict') {
        const reason = isInsufficientStock(error) ? 'insufficient_stock' : 'rejected_operation';
        await repo.recordConflict({
          organizationId,
          deviceId,
          operationId: event.operationId,
          entityId: event.entityId,
          reason,
          details: error.message,
        });
        await repo.recordOperation({
          organizationId,
          deviceId,
          operationId: event.operationId,
          entityId: event.entityId,
          entityType: event.entityType,
          eventType: event.eventType,
          clientSequence: event.clientSequence,
          status: 'needs_review',
          conflictReason: reason,
          message: error.message,
          occurredAt: event.occurredAt,
        });
        return {
          ...base,
          status: 'needs_review',
          sale: null,
          conflictReason: reason,
          message: error.message,
        };
      }

      const message = error instanceof Error ? error.message : 'Sale rejected';
      await repo.recordOperation({
        organizationId,
        deviceId,
        operationId: event.operationId,
        entityId: event.entityId,
        entityType: event.entityType,
        eventType: event.eventType,
        clientSequence: event.clientSequence,
        status: 'rejected',
        conflictReason: 'rejected_operation',
        message,
        occurredAt: event.occurredAt,
      });
      return {
        ...base,
        status: 'rejected',
        sale: null,
        conflictReason: 'rejected_operation',
        message,
      };
    }
  }

  return {
    listDevices: (organizationId) => repo.listDevices(organizationId),
    registerDevice: (organizationId, input) => enroll(organizationId, input),

    async revokeDevice(organizationId, id) {
      const device = await repo.revokeDevice(organizationId, id);
      if (!device) throw notFound('Device not found');
      return device;
    },

    async listConflicts(organizationId, limit) {
      const conflicts = await repo.listConflicts(organizationId, limit);
      return conflicts.map((record) => ({
        id: record.id,
        organizationId: record.organizationId,
        operationId: record.operationId,
        deviceId: record.deviceId,
        entityId: record.entityId,
        reason: record.reason,
        details: record.details,
        createdAt: record.createdAt,
      }));
    },

    async push(organizationId, userId, input) {
      const first = input.events[0] as SyncEvent;
      const storeId = await requireStore(organizationId, first.payload.locationId);
      if (input.device.storeId && input.device.storeId !== storeId) {
        throw validationError('Device store does not match the selling location');
      }

      const device = await repo.findDevice(organizationId, input.device.id);
      if (device?.revokedAt) {
        throw forbidden('Device is revoked');
      }
      const enrolled = await enroll(organizationId, {
        ...input.device,
        storeId,
        registerId: input.device.registerId ?? device?.registerId ?? undefined,
      });

      const results: SyncPushResult[] = [];
      for (const event of input.events) {
        if (event.deviceId !== enrolled.id) {
          throw validationError('Event device does not match the enrolled device');
        }
        results.push(await applyEvent(organizationId, userId, enrolled.id, event));
      }
      return { serverTime: new Date().toISOString(), results };
    },

    async pull(organizationId, query) {
      const device = await repo.findDevice(organizationId, query.deviceId);
      if (!device) throw notFound('Device not found');

      const operations = await repo.listOperationsAfter(
        organizationId,
        device.id,
        query.cursor,
        query.limit,
      );
      const items = [];
      for (const operation of operations) {
        const sale = operation.saleId ? await sales.get(organizationId, operation.saleId) : null;
        items.push({
          sequence: operation.sequence,
          operationId: operation.operationId,
          entityId: operation.entityId,
          status: operation.status,
          sale,
          conflictReason: operation.conflictReason,
        });
      }
      const last = operations[operations.length - 1];
      return {
        cursor: last ? last.sequence : query.cursor,
        serverTime: new Date().toISOString(),
        items,
      };
    },
  };
}
