import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createDb,
  createDrizzleCatalogRepository,
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
 * Real-database catalog checks. Skipped unless DATABASE_URL is set
 * (`docker compose -f infra/docker-compose.yml up -d`).
 */
describeIfDatabase('catalog postgres integration', () => {
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

  it('scopes catalog resources by organization and enforces unique SKUs', async () => {
    const repository = createDrizzleCatalogRepository(db);
    const organizationId = await createOrg('cat');
    const otherOrganizationId = await createOrg('cat-other');

    const category = await repository.categories.create({
      organizationId,
      name: 'Beverages',
    });
    const brand = await repository.brands.create({ organizationId, name: 'Acme' });
    const unit = await repository.units.create({
      organizationId,
      name: 'Piece',
      abbreviation: 'pc',
    });

    const product = await repository.products.create({
      organizationId,
      sku: `SKU-${organizationId.slice(0, 8)}`,
      name: 'Cola',
      priceMinor: 4000,
      categoryId: category.id,
      brandId: brand.id,
      unitId: unit.id,
    });
    expect(product.priceMinor).toBe(4000);
    expect(product.categoryId).toBe(category.id);

    const mine = await repository.products.list(organizationId, { limit: 50, offset: 0 });
    const theirs = await repository.products.list(otherOrganizationId, { limit: 50, offset: 0 });
    expect(mine.total).toBeGreaterThanOrEqual(1);
    expect(theirs.total).toBe(0);

    // The other organization cannot read the product by guessing its id.
    const foreign = await repository.products.findById(otherOrganizationId, product.id);
    expect(foreign).toBeNull();

    // Duplicate SKU within the same organization is rejected by the unique index.
    await expect(
      repository.products.create({
        organizationId,
        sku: product.sku,
        name: 'Cola duplicate',
        priceMinor: 4100,
      }),
    ).rejects.toBeInstanceOf(UniqueConstraintError);
  });
});
