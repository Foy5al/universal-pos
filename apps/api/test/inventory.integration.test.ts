import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createDb,
  createDrizzleCatalogRepository,
  createDrizzleInventoryRepository,
  runMigrations,
  schema,
  UniqueConstraintError,
} from '@pos/db';
import { beforeAll, describe, expect, it } from 'vitest';

const databaseUrl = process.env.DATABASE_URL;
const describeIfDatabase = databaseUrl ? describe : describe.skip;

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(here, '../../../packages/db/migrations');

/**
 * Real-database inventory ledger checks. Skipped unless DATABASE_URL is set
 * (`docker compose -f infra/docker-compose.yml up -d`).
 */
describeIfDatabase('inventory postgres integration', () => {
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

  it('keeps balances and movements consistent and tenant-scoped', async () => {
    const catalog = createDrizzleCatalogRepository(db);
    const inventory = createDrizzleInventoryRepository(db);

    const organizationId = await createOrg('inv');
    const otherOrganizationId = await createOrg('inv-other');

    const product = await catalog.products.create({
      organizationId,
      sku: `SKU-${organizationId.slice(0, 8)}`,
      name: 'Cement bag',
      priceMinor: 55000,
    });

    const location = await inventory.locations.create({ organizationId, name: 'Main Store' });
    const otherLocation = await inventory.locations.create({
      organizationId: otherOrganizationId,
      name: 'Main Store',
    });

    // Duplicate location name within the same organization is rejected.
    await expect(
      inventory.locations.create({ organizationId, name: 'Main Store' }),
    ).rejects.toBeInstanceOf(UniqueConstraintError);

    const received = await inventory.ledger.recordMovement({
      organizationId,
      locationId: location.id,
      productId: product.id,
      movementType: 'receipt',
      quantityDelta: 1_000_000n,
      reason: 'Opening stock',
    });
    expect(received.balance.quantity).toBe('100');
    expect(received.movement.balanceAfter).toBe('100');

    const issued = await inventory.ledger.recordMovement({
      organizationId,
      locationId: location.id,
      productId: product.id,
      movementType: 'issue',
      quantityDelta: -25_000n,
      reason: 'Sale',
    });
    expect(issued.balance.quantity).toBe('97.5');
    expect(issued.movement.balanceAfter).toBe('97.5');

    const balances = await inventory.ledger.listBalances(
      organizationId,
      {},
      { limit: 50, offset: 0 },
    );
    expect(balances.total).toBe(1);
    expect(balances.items[0]).toMatchObject({ locationId: location.id, quantity: '97.5' });

    const otherBalances = await inventory.ledger.listBalances(
      otherOrganizationId,
      {},
      { limit: 50, offset: 0 },
    );
    expect(otherBalances.total).toBe(0);

    const movements = await inventory.ledger.listMovements(
      organizationId,
      { locationId: location.id, productId: product.id },
      { limit: 50, offset: 0 },
    );
    expect(movements.total).toBe(2);
    expect(movements.items.every((movement) => movement.organizationId === organizationId)).toBe(
      true,
    );

    // A location cannot be read by guessing its id from another organization.
    const foreign = await inventory.locations.findById(otherOrganizationId, location.id);
    expect(foreign).toBeNull();
    expect(otherLocation.organizationId).toBe(otherOrganizationId);
  });
});
