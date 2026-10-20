import { randomUUID } from 'node:crypto';

import type { CashMovementType, RegisterShiftStatus } from '@pos/contracts';

import type { CatalogListOptions, CatalogListResult } from '../catalog/types';

export interface CashSalesSource {
  sumCashByShift(organizationId: string, registerShiftId: string): Promise<number>;
  sumRefundsByShift(organizationId: string, registerShiftId: string): Promise<number>;
}

export interface CashMovementRecord {
  id: string;
  shiftId: string;
  type: CashMovementType;
  amountMinor: number;
  reason: string;
  createdBy: string;
  createdAt: string;
}

export interface RegisterShiftRecord {
  id: string;
  organizationId: string;
  storeId: string;
  registerId: string;
  status: RegisterShiftStatus;
  openingFloatMinor: number;
  cashSalesMinor: number;
  cashRefundsMinor: number;
  cashInMinor: number;
  cashOutMinor: number;
  expectedCashMinor: number;
  countedCashMinor: number | null;
  varianceMinor: number | null;
  openedBy: string;
  closedBy: string | null;
  openedAt: string;
  closedAt: string | null;
  notes: string | null;
}

export interface RegisterShiftFilters {
  registerId?: string | undefined;
  status?: RegisterShiftStatus | undefined;
}

export interface OpenRegisterShiftInput {
  organizationId: string;
  storeId: string;
  registerId: string;
  openingFloatMinor: number;
  openedBy: string;
}

export interface AddCashMovementInput {
  organizationId: string;
  shiftId: string;
  type: CashMovementType;
  amountMinor: number;
  reason: string;
  createdBy: string;
}

export interface CloseRegisterShiftInput {
  organizationId: string;
  shiftId: string;
  countedCashMinor: number;
  closedBy: string;
  notes?: string | undefined;
}

export interface RegisterShiftRepository {
  list(
    organizationId: string,
    filters: RegisterShiftFilters,
    options: CatalogListOptions,
  ): Promise<CatalogListResult<RegisterShiftRecord>>;
  findById(organizationId: string, id: string): Promise<RegisterShiftRecord | null>;
  findOpenByRegister(
    organizationId: string,
    registerId: string,
  ): Promise<RegisterShiftRecord | null>;
  open(input: OpenRegisterShiftInput): Promise<RegisterShiftRecord>;
  addCashMovement(input: AddCashMovementInput): Promise<CashMovementRecord>;
  close(input: CloseRegisterShiftInput): Promise<RegisterShiftRecord>;
}

export class RegisterShiftConflictError extends Error {
  constructor() {
    super('Register already has an open shift');
    this.name = 'RegisterShiftConflictError';
  }
}

export class RegisterShiftNotFoundError extends Error {
  constructor() {
    super('Register shift not found');
    this.name = 'RegisterShiftNotFoundError';
  }
}

export class RegisterShiftNotOpenError extends Error {
  constructor() {
    super('Register shift is not open');
    this.name = 'RegisterShiftNotOpenError';
  }
}

export interface RegisterShiftSeed {
  shifts?: readonly RegisterShiftRecord[];
  movements?: readonly CashMovementRecord[];
}

interface StoredShift extends Omit<RegisterShiftRecord, 'expectedCashMinor' | 'cashRefundsMinor'> {
  expectedCashMinor: number | null;
}

function decorate(
  shift: StoredShift,
  cashSalesMinor: number,
  cashRefundsMinor: number,
  cashInMinor: number,
  cashOutMinor: number,
): RegisterShiftRecord {
  const expectedCashMinor =
    shift.status === 'closed' && shift.expectedCashMinor !== null
      ? shift.expectedCashMinor
      : shift.openingFloatMinor + cashSalesMinor + cashInMinor - cashOutMinor - cashRefundsMinor;
  const countedCashMinor = shift.status === 'closed' ? shift.countedCashMinor : null;
  return {
    ...shift,
    cashSalesMinor,
    cashRefundsMinor,
    cashInMinor,
    cashOutMinor,
    expectedCashMinor,
    countedCashMinor,
    varianceMinor: countedCashMinor === null ? null : countedCashMinor - expectedCashMinor,
  };
}

function matchesFilters(
  shift: Pick<RegisterShiftRecord, 'registerId' | 'status'>,
  filters: RegisterShiftFilters,
): boolean {
  if (filters.registerId && shift.registerId !== filters.registerId) return false;
  if (filters.status && shift.status !== filters.status) return false;
  return true;
}

export class InMemoryRegisterShiftRepository implements RegisterShiftRepository {
  private readonly shifts: StoredShift[];
  private readonly movements: CashMovementRecord[];

  constructor(
    private readonly sales: CashSalesSource,
    seed: RegisterShiftSeed = {},
  ) {
    this.shifts = (seed.shifts ?? []).map((shift) => ({ ...shift }));
    this.movements = (seed.movements ?? []).map((movement) => ({ ...movement }));
  }

  private movementTotals(shiftId: string): { cashInMinor: number; cashOutMinor: number } {
    let cashInMinor = 0;
    let cashOutMinor = 0;
    for (const movement of this.movements) {
      if (movement.shiftId !== shiftId) continue;
      if (movement.type === 'in') cashInMinor += movement.amountMinor;
      else cashOutMinor += movement.amountMinor;
    }
    return { cashInMinor, cashOutMinor };
  }

  private async toRecord(shift: StoredShift): Promise<RegisterShiftRecord> {
    const cashSalesMinor = await this.sales.sumCashByShift(shift.organizationId, shift.id);
    const cashRefundsMinor = await this.sales.sumRefundsByShift(shift.organizationId, shift.id);
    const { cashInMinor, cashOutMinor } = this.movementTotals(shift.id);
    return decorate(shift, cashSalesMinor, cashRefundsMinor, cashInMinor, cashOutMinor);
  }

  async list(
    organizationId: string,
    filters: RegisterShiftFilters,
    options: CatalogListOptions,
  ): Promise<CatalogListResult<RegisterShiftRecord>> {
    const scoped = this.shifts
      .filter((shift) => shift.organizationId === organizationId)
      .filter((shift) => matchesFilters(shift, filters))
      .sort((a, b) => b.openedAt.localeCompare(a.openedAt) || b.id.localeCompare(a.id));
    const items = [];
    for (const shift of scoped.slice(options.offset, options.offset + options.limit)) {
      items.push(await this.toRecord(shift));
    }
    return { items, total: scoped.length };
  }

  async findById(organizationId: string, id: string): Promise<RegisterShiftRecord | null> {
    const shift = this.shifts.find(
      (record) => record.organizationId === organizationId && record.id === id,
    );
    return shift ? this.toRecord(shift) : null;
  }

  async findOpenByRegister(
    organizationId: string,
    registerId: string,
  ): Promise<RegisterShiftRecord | null> {
    const shift = this.shifts.find(
      (record) =>
        record.organizationId === organizationId &&
        record.registerId === registerId &&
        record.status === 'open',
    );
    return shift ? this.toRecord(shift) : null;
  }

  async open(input: OpenRegisterShiftInput): Promise<RegisterShiftRecord> {
    if (
      this.shifts.some(
        (shift) =>
          shift.organizationId === input.organizationId &&
          shift.registerId === input.registerId &&
          shift.status === 'open',
      )
    ) {
      throw new RegisterShiftConflictError();
    }
    const shift: StoredShift = {
      id: randomUUID(),
      organizationId: input.organizationId,
      storeId: input.storeId,
      registerId: input.registerId,
      status: 'open',
      openingFloatMinor: input.openingFloatMinor,
      cashSalesMinor: 0,
      cashInMinor: 0,
      cashOutMinor: 0,
      expectedCashMinor: input.openingFloatMinor,
      countedCashMinor: null,
      varianceMinor: null,
      openedBy: input.openedBy,
      closedBy: null,
      openedAt: new Date().toISOString(),
      closedAt: null,
      notes: null,
    };
    this.shifts.push(shift);
    return this.toRecord(shift);
  }

  async addCashMovement(input: AddCashMovementInput): Promise<CashMovementRecord> {
    const shift = this.shifts.find(
      (record) => record.organizationId === input.organizationId && record.id === input.shiftId,
    );
    if (!shift || shift.status !== 'open') {
      throw new RegisterShiftNotOpenError();
    }
    const movement: CashMovementRecord = {
      id: randomUUID(),
      shiftId: input.shiftId,
      type: input.type,
      amountMinor: input.amountMinor,
      reason: input.reason,
      createdBy: input.createdBy,
      createdAt: new Date().toISOString(),
    };
    this.movements.push(movement);
    return movement;
  }

  async close(input: CloseRegisterShiftInput): Promise<RegisterShiftRecord> {
    const shift = this.shifts.find(
      (record) => record.organizationId === input.organizationId && record.id === input.shiftId,
    );
    if (!shift || shift.status !== 'open') {
      throw new RegisterShiftNotOpenError();
    }
    const cashSalesMinor = await this.sales.sumCashByShift(input.organizationId, shift.id);
    const cashRefundsMinor = await this.sales.sumRefundsByShift(input.organizationId, shift.id);
    const { cashInMinor, cashOutMinor } = this.movementTotals(shift.id);
    shift.status = 'closed';
    shift.expectedCashMinor =
      shift.openingFloatMinor + cashSalesMinor + cashInMinor - cashOutMinor - cashRefundsMinor;
    shift.countedCashMinor = input.countedCashMinor;
    shift.closedBy = input.closedBy;
    shift.closedAt = new Date().toISOString();
    shift.notes = input.notes ?? null;
    return this.toRecord(shift);
  }
}
