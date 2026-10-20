import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createDb,
  createDrizzleCatalogRepository,
  createDrizzleInventoryRepository,
  createDrizzleRegisterShiftRepository,
  createDrizzleSalesRepository,
  InsufficientStockError,
  runMigrations,
  schema,
} from '@pos/db';
import { beforeAll, describe, expect, it } from 'vitest';

const databaseUrl = process.env.DATABASE_URL;
const describeIfDatabase = databaseUrl ? describe : describe.skip;

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(here, '../../../packages/db/migrations');

/**
 * Real-database sale checks: the sale header, lines, cash payment and stock
 * issue commit in one transaction, retries are idempotent and insufficient
 * stock rolls the whole sale back. Skipped unless DATABASE_URL is set.
 */
describeIfDatabase('sales postgres integration', () => {
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
      displayName: 'Integration Cashier',
    });
    return id;
  }

  async function createShift(
    organizationId: string,
    userId: string,
  ): Promise<{ shiftId: string; storeId: string }> {
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
        .values({
          organizationId,
          storeId: store.id,
          name: 'Till',
          code: `R-${crypto.randomUUID().slice(0, 6)}`,
        })
        .returning()
    )[0];
    if (!register) throw new Error('Failed to create register');
    const shift = await createDrizzleRegisterShiftRepository(db).open({
      organizationId,
      storeId: store.id,
      registerId: register.id,
      openingFloatMinor: 10000,
      openedBy: userId,
    });
    return { shiftId: shift.id, storeId: store.id };
  }

  async function seedStock(
    organizationId: string,
    locationId: string,
    productId: string,
    quantity: string,
  ): Promise<void> {
    const inventory = createDrizzleInventoryRepository(db);
    await inventory.ledger.recordMovement({
      organizationId,
      locationId,
      productId,
      movementType: 'receipt',
      quantityDelta: BigInt(quantity) * 10_000n,
      reason: 'seed',
    });
  }

  it('posts an idempotent cash sale and issues stock once', async () => {
    const catalog = createDrizzleCatalogRepository(db);
    const inventory = createDrizzleInventoryRepository(db);
    const sales = createDrizzleSalesRepository(db);

    const organizationId = await createOrg('sale');
    const userId = await createUser();
    const product = await catalog.products.create({
      organizationId,
      sku: `SKU-${organizationId.slice(0, 8)}`,
      name: 'Soap',
      priceMinor: 4500,
    });
    const { shiftId, storeId } = await createShift(organizationId, userId);
    const location = await inventory.locations.create({
      organizationId,
      storeId,
      name: 'Till 1',
    });
    await seedStock(organizationId, location.id, product.id, '5');

    const operationId = crypto.randomUUID();
    const input = {
      organizationId,
      locationId: location.id,
      operationId,
      registerShiftId: shiftId,
      currency: 'BDT',
      subtotalMinor: 9000,
      totalMinor: 9000,
      paidMinor: 10000,
      changeMinor: 1000,
      createdBy: userId,
      lines: [
        {
          productId: product.id,
          sku: product.sku,
          name: product.name,
          quantity: '2',
          unitPriceMinor: 4500,
          lineTotalMinor: 9000,
        },
      ],
      payments: [{ method: 'cash' as const, amountMinor: 10000 }],
    };

    const first = await sales.sales.create(input);
    expect(first.saleNumber).toMatch(/^INV-\d{8}-[0-9A-F]{8}$/);
    expect(first.totalMinor).toBe(9000);
    expect(first.changeMinor).toBe(1000);

    const retry = await sales.sales.create(input);
    expect(retry.id).toBe(first.id);

    const balances = await inventory.ledger.listBalances(
      organizationId,
      { locationId: location.id, productId: product.id },
      { limit: 50, offset: 0 },
    );
    expect(balances.items[0]?.quantity).toBe('3');

    const movements = await inventory.ledger.listMovements(
      organizationId,
      { locationId: location.id, productId: product.id },
      { limit: 50, offset: 0 },
    );
    expect(movements.total).toBe(2);
    expect(movements.items.filter((row) => row.movementType === 'issue')).toHaveLength(1);

    const foreign = await sales.sales.findById(crypto.randomUUID(), first.id);
    expect(foreign).toBeNull();
  });

  it('rolls back the sale, lines and stock when stock is insufficient', async () => {
    const catalog = createDrizzleCatalogRepository(db);
    const inventory = createDrizzleInventoryRepository(db);
    const sales = createDrizzleSalesRepository(db);

    const organizationId = await createOrg('sale-short');
    const userId = await createUser();
    const product = await catalog.products.create({
      organizationId,
      sku: `SKU-${organizationId.slice(0, 8)}`,
      name: 'Oil',
      priceMinor: 1000,
    });
    const { shiftId, storeId } = await createShift(organizationId, userId);
    const location = await inventory.locations.create({
      organizationId,
      storeId,
      name: 'Till 2',
    });
    await seedStock(organizationId, location.id, product.id, '1');

    await expect(
      sales.sales.create({
        organizationId,
        locationId: location.id,
        operationId: crypto.randomUUID(),
        registerShiftId: shiftId,
        currency: 'BDT',
        subtotalMinor: 5000,
        totalMinor: 5000,
        paidMinor: 5000,
        changeMinor: 0,
        createdBy: userId,
        lines: [
          {
            productId: product.id,
            sku: product.sku,
            name: product.name,
            quantity: '5',
            unitPriceMinor: 1000,
            lineTotalMinor: 5000,
          },
        ],
        payments: [{ method: 'cash', amountMinor: 5000 }],
      }),
    ).rejects.toBeInstanceOf(InsufficientStockError);

    const balances = await inventory.ledger.listBalances(
      organizationId,
      { locationId: location.id, productId: product.id },
      { limit: 50, offset: 0 },
    );
    expect(balances.items[0]?.quantity).toBe('1');

    const listed = await sales.sales.list(organizationId, {}, { limit: 50, offset: 0 });
    expect(listed.total).toBe(0);
  });
});


