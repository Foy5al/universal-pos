import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createDb,
  createDrizzleCatalogRepository,
  createDrizzleInventoryRepository,
  createDrizzleRefundRepository,
  createDrizzleRegisterShiftRepository,
  createDrizzleReportsRepository,
  createDrizzleSalesRepository,
  RegisterShiftNotOpenError,
  runMigrations,
  SaleAlreadyRefundedError,
  schema,
} from '@pos/db';
import { beforeAll, describe, expect, it } from 'vitest';

const databaseUrl = process.env.DATABASE_URL;
const describeIfDatabase = databaseUrl ? describe : describe.skip;

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(here, '../../../packages/db/migrations');

describeIfDatabase('refunds postgres integration', () => {
  let db: ReturnType<typeof createDb>;

  beforeAll(async () => {
    db = createDb(databaseUrl as string);
    await runMigrations(db, migrationsFolder);
  });

  async function createOrg(prefix: string): Promise<string> {
    const id = crypto.randomUUID();
    await db
      .insert(schema.organizations)
      .values({ id, slug: `${prefix}-${id.slice(0, 8)}`, legalName: `${prefix} Org` });
    return id;
  }

  async function createUser(): Promise<string> {
    const id = crypto.randomUUID();
    await db.insert(schema.users).values({
      id,
      email: `${id.slice(0, 12)}@example.com`,
      passwordHash: 'x',
      displayName: 'Refund Cashier',
    });
    return id;
  }

  it('refunds once, returns stock and subtracts from shift cash', async () => {
    const catalog = createDrizzleCatalogRepository(db);
    const inventory = createDrizzleInventoryRepository(db);
    const sales = createDrizzleSalesRepository(db);
    const shifts = createDrizzleRegisterShiftRepository(db);
    const refunds = createDrizzleRefundRepository(db);
    const reports = createDrizzleReportsRepository(db);

    const organizationId = await createOrg('refund');
    const userId = await createUser();
    const product = await catalog.products.create({
      organizationId,
      sku: `SKU-${organizationId.slice(0, 8)}`,
      name: 'Soap',
      priceMinor: 4500,
    });
    const store = (
      await db
        .insert(schema.stores)
        .values({ organizationId, name: `Store ${crypto.randomUUID().slice(0, 6)}` })
        .returning()
    )[0];
    if (!store) throw new Error('Failed to create store');
    const register = (
      await db
        .insert(schema.registers)
        .values({ organizationId, storeId: store.id, name: 'Till', code: 'R1' })
        .returning()
    )[0];
    if (!register) throw new Error('Failed to create register');
    const location = await inventory.locations.create({
      organizationId,
      storeId: store.id,
      name: 'Counter',
    });
    await inventory.ledger.recordMovement({
      organizationId,
      locationId: location.id,
      productId: product.id,
      movementType: 'receipt',
      quantityDelta: 50_000n,
      reason: 'seed',
    });
    const shift = await shifts.open({
      organizationId,
      storeId: store.id,
      registerId: register.id,
      openingFloatMinor: 10_000,
      openedBy: userId,
    });

    const line = {
      productId: product.id,
      sku: product.sku,
      name: product.name,
      quantity: '2',
      unitPriceMinor: 4500,
      lineTotalMinor: 9000,
    };
    const sale = await sales.sales.create({
      organizationId,
      locationId: location.id,
      operationId: crypto.randomUUID(),
      registerShiftId: shift.id,
      currency: 'BDT',
      subtotalMinor: 9000,
      totalMinor: 9000,
      paidMinor: 10_000,
      changeMinor: 1000,
      createdBy: userId,
      lines: [line],
      payments: [{ method: 'cash', amountMinor: 10_000 }],
    });

    const input = {
      organizationId,
      saleId: sale.id,
      locationId: location.id,
      registerShiftId: shift.id,
      operationId: crypto.randomUUID(),
      amountMinor: sale.totalMinor,
      reason: 'Customer return',
      createdBy: userId,
      lines: [line],
    };
    const refund = await refunds.create(input);

    expect(refund.refundNumber).toMatch(/^REF-\d{8}-[0-9A-F]{8}$/);
    expect(refund.amountMinor).toBe(9000);
    expect(refund.lines[0]?.quantity).toBe('2');

    const retry = await refunds.create(input);
    expect(retry.id).toBe(refund.id);

    const balances = await inventory.ledger.listBalances(
      organizationId,
      { locationId: location.id, productId: product.id },
      { limit: 50, offset: 0 },
    );
    expect(balances.items[0]?.quantity).toBe('5');

    const movements = await inventory.ledger.listMovements(
      organizationId,
      { locationId: location.id, productId: product.id },
      { limit: 50, offset: 0 },
    );
    expect(movements.items.filter((row) => row.movementType === 'return')).toHaveLength(1);

    const activity = await reports.shiftActivity(organizationId, shift.id);
    expect(activity).toEqual({
      saleCount: 1,
      refundCount: 1,
      unitsSold: '2',
      grossSalesMinor: 9000,
      refundsMinor: 9000,
    });

    const summary = await reports.salesSummary(organizationId, {
      from: '2020-01-01T00:00:00.000Z',
      to: '2030-01-01T00:00:00.000Z',
      locationIds: [location.id],
    });
    expect(summary.saleCount).toBe(1);
    expect(summary.refundCount).toBe(1);
    expect(summary.grossSalesMinor).toBe(9000);
    expect(summary.refundsMinor).toBe(9000);
    expect(summary.unitsSold).toBe('2');
    expect(summary.days).toHaveLength(1);
    expect(summary.days[0]?.grossSalesMinor).toBe(9000);

    expect(
      await reports.salesSummary(crypto.randomUUID(), {
        from: '2020-01-01T00:00:00.000Z',
        to: '2030-01-01T00:00:00.000Z',
      }),
    ).toMatchObject({ saleCount: 0, refundCount: 0, grossSalesMinor: 0 });

    const current = await shifts.findById(organizationId, shift.id);
    expect(current?.cashSalesMinor).toBe(9000);
    expect(current?.cashRefundsMinor).toBe(9000);
    expect(current?.expectedCashMinor).toBe(10_000);

    await expect(
      refunds.create({ ...input, operationId: crypto.randomUUID() }),
    ).rejects.toBeInstanceOf(SaleAlreadyRefundedError);

    const secondSale = await sales.sales.create({
      organizationId,
      locationId: location.id,
      operationId: crypto.randomUUID(),
      registerShiftId: shift.id,
      currency: 'BDT',
      subtotalMinor: 4500,
      totalMinor: 4500,
      paidMinor: 4500,
      changeMinor: 0,
      createdBy: userId,
      lines: [{ ...line, quantity: '1', lineTotalMinor: 4500 }],
      payments: [{ method: 'cash', amountMinor: 4500 }],
    });
    await shifts.close({
      organizationId,
      shiftId: shift.id,
      countedCashMinor: 10_000 + 9000 + 4500 - 9000,
      closedBy: userId,
    });

    await expect(
      refunds.create({
        ...input,
        saleId: secondSale.id,
        operationId: crypto.randomUUID(),
        amountMinor: secondSale.totalMinor,
      }),
    ).rejects.toBeInstanceOf(RegisterShiftNotOpenError);

    const foreign = await refunds.findBySaleId(crypto.randomUUID(), sale.id);
    expect(foreign).toBeNull();
  });
});
