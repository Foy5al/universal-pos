import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createDb,
  createDrizzleCatalogRepository,
  createDrizzleInventoryRepository,
  createDrizzlePurchasingRepository,
  runMigrations,
  schema,
} from '@pos/db';
import { beforeAll, describe, expect, it } from 'vitest';

const databaseUrl = process.env.DATABASE_URL;
const describeIfDatabase = databaseUrl ? describe : describe.skip;

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(here, '../../../packages/db/migrations');

describeIfDatabase('restock postgres integration', () => {
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

  it('schedules pending requests onto a purchase order and fulfils or releases them', async () => {
    const catalog = createDrizzleCatalogRepository(db);
    const inventory = createDrizzleInventoryRepository(db);
    const purchasing = createDrizzlePurchasingRepository(db);

    const organizationId = await createOrg('restock');
    const otherOrganizationId = await createOrg('restock-other');
    const product = await catalog.products.create({
      organizationId,
      sku: `SKU-${organizationId.slice(0, 8)}`,
      name: 'Sold out item',
      priceMinor: 1000,
    });
    const location = await inventory.locations.create({ organizationId, name: 'Front shelf' });
    const otherLocation = await inventory.locations.create({
      organizationId,
      name: 'Back shelf',
    });
    const supplier = await purchasing.suppliers.create({
      organizationId,
      name: 'Restock Supplier',
    });

    const request = await purchasing.restockRequests.create({
      organizationId,
      locationId: location.id,
      productId: product.id,
      requestedByUserId: crypto.randomUUID(),
      requestedByName: 'POS Cashier',
      requestedQuantity: '5',
      note: 'Shelf empty',
    });
    const otherLocationRequest = await purchasing.restockRequests.create({
      organizationId,
      locationId: otherLocation.id,
      productId: product.id,
      requestedByUserId: crypto.randomUUID(),
      requestedByName: 'POS Cashier',
      requestedQuantity: '2',
    });

    const order = await purchasing.orders.create({
      organizationId,
      supplierId: supplier.id,
      locationId: location.id,
      lines: [{ productId: product.id, quantity: '5', unitCostMinor: 700, lineTotalMinor: 3500 }],
    });
    const lineId = order.lines[0]?.id as string;

    const scheduled = await purchasing.restockRequests.schedule({
      organizationId,
      locationId: location.id,
      purchaseOrderId: order.id,
      requestIds: [request.id, otherLocationRequest.id],
      lines: [{ id: lineId, productId: product.id }],
    });
    expect(scheduled).toBe(1);

    const afterSchedule = await purchasing.restockRequests.findById(organizationId, request.id);
    expect(afterSchedule).toMatchObject({
      status: 'scheduled',
      purchaseOrderId: order.id,
      purchaseOrderLineId: lineId,
    });
    const untouched = await purchasing.restockRequests.findById(
      organizationId,
      otherLocationRequest.id,
    );
    expect(untouched?.status).toBe('pending');

    expect(
      await purchasing.restockRequests.list(
        organizationId,
        { status: 'scheduled' },
        { limit: 50, offset: 0 },
      ),
    ).toMatchObject({ total: 1 });
    expect(
      await purchasing.restockRequests.list(otherOrganizationId, {}, { limit: 50, offset: 0 }),
    ).toMatchObject({ total: 0 });

    await purchasing.restockRequests.releaseByOrder(organizationId, order.id);
    const released = await purchasing.restockRequests.findById(organizationId, request.id);
    expect(released).toMatchObject({
      status: 'pending',
      purchaseOrderId: null,
      purchaseOrderLineId: null,
    });

    await purchasing.restockRequests.schedule({
      organizationId,
      locationId: location.id,
      purchaseOrderId: order.id,
      requestIds: [request.id],
      lines: [{ id: lineId, productId: product.id }],
    });
    expect(await purchasing.restockRequests.fulfillByOrder(organizationId, order.id)).toBe(1);
    const fulfilled = await purchasing.restockRequests.findById(organizationId, request.id);
    expect(fulfilled?.status).toBe('fulfilled');
    expect(await purchasing.restockRequests.fulfillByOrder(otherOrganizationId, order.id)).toBe(0);
  });
});
