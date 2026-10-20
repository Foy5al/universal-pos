import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createDb,
  createDrizzleCatalogRepository,
  createDrizzleInventoryRepository,
  createDrizzlePurchasingRepository,
  ReceiveConflictError,
  runMigrations,
  schema,
} from '@pos/db';
import { beforeAll, describe, expect, it } from 'vitest';

const databaseUrl = process.env.DATABASE_URL;
const describeIfDatabase = databaseUrl ? describe : describe.skip;

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(here, '../../../packages/db/migrations');

/**
 * Real-database purchasing checks: PO totals, status transitions and atomic
 * goods receipt into the stock ledger. Skipped unless DATABASE_URL is set.
 */
describeIfDatabase('purchasing postgres integration', () => {
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

  it('receives goods into stock and advances the order status', async () => {
    const catalog = createDrizzleCatalogRepository(db);
    const inventory = createDrizzleInventoryRepository(db);
    const purchasing = createDrizzlePurchasingRepository(db);

    const organizationId = await createOrg('po');
    const otherOrganizationId = await createOrg('po-other');

    const product = await catalog.products.create({
      organizationId,
      sku: `SKU-${organizationId.slice(0, 8)}`,
      name: 'Cement bag',
      priceMinor: 55000,
    });
    const location = await inventory.locations.create({
      organizationId,
      name: 'Main Warehouse',
    });
    const supplier = await purchasing.suppliers.create({
      organizationId,
      name: 'Acme Supplies',
    });
    const otherSupplier = await purchasing.suppliers.create({
      organizationId: otherOrganizationId,
      name: 'Acme Supplies',
    });

    const order = await purchasing.orders.create({
      organizationId,
      supplierId: supplier.id,
      locationId: location.id,
      lines: [
        { productId: product.id, quantity: '10', unitCostMinor: 1000, lineTotalMinor: 10000 },
      ],
    });
    expect(order.status).toBe('draft');
    expect(order.totalMinor).toBe(10000);
    expect(order.lines).toHaveLength(1);

    await purchasing.orders.updateStatus(organizationId, order.id, 'ordered');
    const lineId = order.lines[0]?.id as string;

    const partial = await purchasing.orders.receive({
      organizationId,
      purchaseOrderId: order.id,
      lines: [{ purchaseOrderLineId: lineId, quantity: '4' }],
    });
    expect(partial?.purchaseOrder.status).toBe('partially_received');
    expect(partial?.purchaseOrder.lines[0]?.receivedQuantity).toBe('4');

    const balances = await inventory.ledger.listBalances(
      organizationId,
      { locationId: location.id, productId: product.id },
      { limit: 50, offset: 0 },
    );
    expect(balances.items[0]?.quantity).toBe('4');

    const complete = await purchasing.orders.receive({
      organizationId,
      purchaseOrderId: order.id,
      lines: [{ purchaseOrderLineId: lineId, quantity: '6' }],
    });
    expect(complete?.purchaseOrder.status).toBe('received');
    expect(complete?.purchaseOrder.lines[0]?.receivedQuantity).toBe('10');

    const finalBalances = await inventory.ledger.listBalances(
      organizationId,
      { locationId: location.id, productId: product.id },
      { limit: 50, offset: 0 },
    );
    expect(finalBalances.items[0]?.quantity).toBe('10');

    const movements = await inventory.ledger.listMovements(
      organizationId,
      { locationId: location.id, productId: product.id },
      { limit: 50, offset: 0 },
    );
    expect(movements.total).toBe(2);
    expect(movements.items.every((movement) => movement.movementType === 'receipt')).toBe(true);
    expect(movements.items.every((movement) => movement.unitCostMinor === 1000)).toBe(true);

    const receiving = await inventory.ledger.summarizeMovements(organizationId, {
      movementType: 'receipt',
    });
    expect(receiving).toEqual({
      count: 2,
      units: '10',
      costValueMinor: 10000,
      missingCostCount: 0,
    });

    // Cross-tenant reads do not leak the order or supplier.
    const foreignOrder = await purchasing.orders.findById(otherOrganizationId, order.id);
    expect(foreignOrder).toBeNull();
    expect(otherSupplier.organizationId).toBe(otherOrganizationId);
    const otherOrders = await purchasing.orders.list(
      otherOrganizationId,
      {},
      { limit: 50, offset: 0 },
    );
    expect(otherOrders.total).toBe(0);
  });

  it('rejects over-receiving without changing the ledger or order', async () => {
    const catalog = createDrizzleCatalogRepository(db);
    const inventory = createDrizzleInventoryRepository(db);
    const purchasing = createDrizzlePurchasingRepository(db);

    const organizationId = await createOrg('po-over');
    const product = await catalog.products.create({
      organizationId,
      sku: `SKU-${organizationId.slice(0, 8)}`,
      name: 'Bolt',
      priceMinor: 1000,
    });
    const location = await inventory.locations.create({ organizationId, name: 'Overflow' });
    const supplier = await purchasing.suppliers.create({
      organizationId,
      name: 'Over Supplier',
    });
    const order = await purchasing.orders.create({
      organizationId,
      supplierId: supplier.id,
      locationId: location.id,
      lines: [{ productId: product.id, quantity: '5', unitCostMinor: 200, lineTotalMinor: 1000 }],
    });
    await purchasing.orders.updateStatus(organizationId, order.id, 'ordered');
    const lineId = order.lines[0]?.id as string;

    await expect(
      purchasing.orders.receive({
        organizationId,
        purchaseOrderId: order.id,
        lines: [{ purchaseOrderLineId: lineId, quantity: '6' }],
      }),
    ).rejects.toBeInstanceOf(ReceiveConflictError);

    const balances = await inventory.ledger.listBalances(
      organizationId,
      { locationId: location.id, productId: product.id },
      { limit: 50, offset: 0 },
    );
    expect(balances.total).toBe(0);

    const reloaded = await purchasing.orders.findById(organizationId, order.id);
    expect(reloaded?.status).toBe('ordered');
    expect(reloaded?.lines[0]?.receivedQuantity).toBe('0');
  });
});
