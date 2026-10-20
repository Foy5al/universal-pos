import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createDb,
  createDrizzleCatalogRepository,
  createDrizzleInventoryRepository,
  createDrizzleRegisterShiftRepository,
  createDrizzleSalesRepository,
  RegisterShiftConflictError,
  RegisterShiftNotOpenError,
  runMigrations,
  schema,
} from '@pos/db';
import { beforeAll, describe, expect, it } from 'vitest';

const databaseUrl = process.env.DATABASE_URL;
const describeIfDatabase = databaseUrl ? describe : describe.skip;

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(here, '../../../packages/db/migrations');

describeIfDatabase('register shifts postgres integration', () => {
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
      displayName: 'Shift Cashier',
    });
    return id;
  }

  it('derives expected cash from float, sales and movements, then closes once', async () => {
    const catalog = createDrizzleCatalogRepository(db);
    const inventory = createDrizzleInventoryRepository(db);
    const sales = createDrizzleSalesRepository(db);
    const shifts = createDrizzleRegisterShiftRepository(db);

    const organizationId = await createOrg('shift');
    const userId = await createUser();
    const store = (
      await db
        .insert(schema.stores)
        .values({ organizationId, name: `Store ${organizationId.slice(0, 6)}` })
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
    const product = await catalog.products.create({
      organizationId,
      sku: `SKU-${organizationId.slice(0, 8)}`,
      name: 'Rice',
      priceMinor: 1500,
    });
    await inventory.ledger.recordMovement({
      organizationId,
      locationId: location.id,
      productId: product.id,
      movementType: 'receipt',
      quantityDelta: 100_000n,
      reason: 'seed',
    });

    const shift = await shifts.open({
      organizationId,
      storeId: store.id,
      registerId: register.id,
      openingFloatMinor: 10_000,
      openedBy: userId,
    });

    await expect(
      shifts.open({
        organizationId,
        storeId: store.id,
        registerId: register.id,
        openingFloatMinor: 0,
        openedBy: userId,
      }),
    ).rejects.toBeInstanceOf(RegisterShiftConflictError);

    await sales.sales.create({
      organizationId,
      locationId: location.id,
      operationId: crypto.randomUUID(),
      registerShiftId: shift.id,
      currency: 'BDT',
      subtotalMinor: 4500,
      totalMinor: 4500,
      paidMinor: 5000,
      changeMinor: 500,
      createdBy: userId,
      lines: [
        {
          productId: product.id,
          sku: product.sku,
          name: product.name,
          quantity: '3',
          unitPriceMinor: 1500,
          lineTotalMinor: 4500,
        },
      ],
      payments: [{ method: 'cash', amountMinor: 5000 }],
    });

    await shifts.addCashMovement({
      organizationId,
      shiftId: shift.id,
      type: 'in',
      amountMinor: 1000,
      reason: 'Float top-up',
      createdBy: userId,
    });
    await shifts.addCashMovement({
      organizationId,
      shiftId: shift.id,
      type: 'out',
      amountMinor: 500,
      reason: 'Courier',
      createdBy: userId,
    });

    const current = await shifts.findById(organizationId, shift.id);
    expect(current?.cashSalesMinor).toBe(4500);
    expect(current?.expectedCashMinor).toBe(15_000);

    const closed = await shifts.close({
      organizationId,
      shiftId: shift.id,
      countedCashMinor: 14_800,
      closedBy: userId,
      notes: 'Short by 200',
    });
    expect(closed.status).toBe('closed');
    expect(closed.expectedCashMinor).toBe(15_000);
    expect(closed.varianceMinor).toBe(-200);
    expect(closed.cashSalesMinor).toBe(4500);

    await expect(
      shifts.close({
        organizationId,
        shiftId: shift.id,
        countedCashMinor: 15_000,
        closedBy: userId,
      }),
    ).rejects.toBeInstanceOf(RegisterShiftNotOpenError);

    await expect(
      sales.sales.create({
        organizationId,
        locationId: location.id,
        operationId: crypto.randomUUID(),
        registerShiftId: shift.id,
        currency: 'BDT',
        subtotalMinor: 1500,
        totalMinor: 1500,
        paidMinor: 1500,
        changeMinor: 0,
        createdBy: userId,
        lines: [
          {
            productId: product.id,
            sku: product.sku,
            name: product.name,
            quantity: '1',
            unitPriceMinor: 1500,
            lineTotalMinor: 1500,
          },
        ],
        payments: [{ method: 'cash', amountMinor: 1500 }],
      }),
    ).rejects.toBeInstanceOf(RegisterShiftNotOpenError);

    const foreign = await shifts.findById(crypto.randomUUID(), shift.id);
    expect(foreign).toBeNull();
  });
});
