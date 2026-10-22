import {
  page,
  type AddCashMovementRequest,
  type CashMovement,
  type CloseRegisterShiftRequest,
  type CreateRegisterRequest,
  type ListQuery,
  type OpenRegisterShiftRequest,
  type Page,
  type Register,
  type RegisterShift,
  type RegisterShiftListQuery,
} from '@pos/contracts';
import type {
  CashMovementRecord,
  RegisterRecord,
  RegisterRepository,
  RegisterShiftRecord,
  RegisterShiftRepository,
  StoreRepository,
} from '@pos/db';

import { conflict, notFound, validationError } from '../../core/errors';

export interface RegisterService {
  list(organizationId: string, query: ListQuery): Promise<Page<Register>>;
  create(organizationId: string, input: CreateRegisterRequest): Promise<Register>;
  listShifts(organizationId: string, query: RegisterShiftListQuery): Promise<Page<RegisterShift>>;
  current(organizationId: string, registerId: string): Promise<RegisterShift | null>;
  getShift(organizationId: string, id: string): Promise<RegisterShift>;
  openShift(
    organizationId: string,
    userId: string,
    input: OpenRegisterShiftRequest,
  ): Promise<RegisterShift>;
  addCashMovement(
    organizationId: string,
    userId: string,
    shiftId: string,
    input: AddCashMovementRequest,
  ): Promise<CashMovement>;
  closeShift(
    organizationId: string,
    userId: string,
    shiftId: string,
    input: CloseRegisterShiftRequest,
  ): Promise<RegisterShift>;
}

function toShift(record: RegisterShiftRecord): RegisterShift {
  return record;
}

function toMovement(record: CashMovementRecord): CashMovement {
  return record;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === '23505'
  );
}

export function createRegisterService(
  registers: RegisterRepository,
  shifts: RegisterShiftRepository,
  stores: StoreRepository,
): RegisterService {
  async function requireRegister(
    organizationId: string,
    registerId: string,
  ): Promise<RegisterRecord> {
    const register = await registers.findInOrganization(organizationId, registerId);
    if (!register) {
      throw notFound('Register not found');
    }
    return register;
  }

  async function requireShift(organizationId: string, id: string): Promise<RegisterShiftRecord> {
    const shift = await shifts.findById(organizationId, id);
    if (!shift) {
      throw notFound('Register shift not found');
    }
    return shift;
  }

  return {
    async list(organizationId, query) {
      const items = await registers.listByOrganization(organizationId);
      return page(items.slice(query.offset, query.offset + query.limit), items.length, query);
    },

    async create(organizationId, input) {
      const store = await stores.findInOrganization(organizationId, input.storeId);
      if (!store) {
        throw validationError('Store not found');
      }
      if (await registers.findByCode(organizationId, input.storeId, input.code)) {
        throw conflict('A counter with this code already exists in the store');
      }
      try {
        return await registers.create({ organizationId, ...input });
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw conflict('A counter with this code already exists in the store');
        }
        throw error;
      }
    },

    async listShifts(organizationId, query) {
      const result = await shifts.list(
        organizationId,
        { registerId: query.registerId, status: query.status },
        { limit: query.limit, offset: query.offset },
      );
      return page(result.items.map(toShift), result.total, query);
    },

    async current(organizationId, registerId) {
      await requireRegister(organizationId, registerId);
      const shift = await shifts.findOpenByRegister(organizationId, registerId);
      return shift ? toShift(shift) : null;
    },

    async getShift(organizationId, id) {
      return toShift(await requireShift(organizationId, id));
    },

    async openShift(organizationId, userId, input) {
      const register = await requireRegister(organizationId, input.registerId);
      try {
        const shift = await shifts.open({
          organizationId,
          storeId: register.storeId,
          registerId: register.id,
          openingFloatMinor: input.openingFloatMinor,
          openedBy: userId,
        });
        return toShift(shift);
      } catch (error) {
        if (error instanceof Error && error.name === 'RegisterShiftConflictError') {
          throw conflict('Register already has an open shift');
        }
        throw error;
      }
    },

    async addCashMovement(organizationId, userId, shiftId, input) {
      await requireShift(organizationId, shiftId);
      try {
        return toMovement(
          await shifts.addCashMovement({
            organizationId,
            shiftId,
            type: input.type,
            amountMinor: input.amountMinor,
            reason: input.reason,
            createdBy: userId,
          }),
        );
      } catch (error) {
        if (error instanceof Error && error.name === 'RegisterShiftNotOpenError') {
          throw conflict('Register shift is closed');
        }
        throw error;
      }
    },

    async closeShift(organizationId, userId, shiftId, input) {
      await requireShift(organizationId, shiftId);
      try {
        const shift = await shifts.close({
          organizationId,
          shiftId,
          countedCashMinor: input.countedCashMinor,
          closedBy: userId,
          notes: input.notes,
        });
        return toShift(shift);
      } catch (error) {
        if (error instanceof Error && error.name === 'RegisterShiftNotOpenError') {
          throw conflict('Register shift is closed');
        }
        throw error;
      }
    },
  };
}
