import { and, eq } from 'drizzle-orm';

import { PERMISSION_KEYS } from '@pos/contracts';

import type { Database } from './client';
import { createDrizzleInventoryRepository } from './repositories/inventory';
import * as schema from './schema/index';
import { seedPermissions } from './seed';
import { DEMO_CATEGORIES, DEMO_PRODUCTS } from './seedDemoProducts';

export interface DemoSeedOptions {
  email: string;
  passwordHash: string;
  organizationSlug?: string;
  organizationName?: string;
  storeName?: string;
  locationName?: string;
}

export interface DemoSeedResult {
  organizationId: string;
  userId: string;
  locationId: string;
  registerId: string;
}

/**
 * Idempotent development fixture: one organization, store, stock location,
 * owner role with every permission and demo grocery/electrical products with
 * opening stock.
 * Passwords are hashed by the caller so this package never owns a hasher.
 */
export async function seedDemoData(
  db: Database,
  options: DemoSeedOptions,
): Promise<DemoSeedResult> {
  const slug = options.organizationSlug ?? 'demo-store';
  const storeName = options.storeName ?? 'Demo Store';
  const locationName = options.locationName ?? 'Front Counter';

  await seedPermissions(db);

  const existingOrg = await db
    .select()
    .from(schema.organizations)
    .where(eq(schema.organizations.slug, slug))
    .limit(1);
  const organization =
    existingOrg[0] ??
    (
      await db
        .insert(schema.organizations)
        .values({
          slug,
          legalName: options.organizationName ?? 'Demo Retail',
          currency: 'BDT',
        })
        .returning()
    )[0];
  if (!organization) throw new Error('Failed to create demo organization');

  const existingStore = await db
    .select()
    .from(schema.stores)
    .where(
      and(eq(schema.stores.organizationId, organization.id), eq(schema.stores.name, storeName)),
    )
    .limit(1);
  const store =
    existingStore[0] ??
    (
      await db
        .insert(schema.stores)
        .values({ organizationId: organization.id, name: storeName })
        .returning()
    )[0];
  if (!store) throw new Error('Failed to create demo store');

  const existingLocation = await db
    .select()
    .from(schema.stockLocations)
    .where(
      and(
        eq(schema.stockLocations.organizationId, organization.id),
        eq(schema.stockLocations.name, locationName),
      ),
    )
    .limit(1);
  const location =
    existingLocation[0] ??
    (
      await db
        .insert(schema.stockLocations)
        .values({ organizationId: organization.id, storeId: store.id, name: locationName })
        .returning()
    )[0];
  if (!location) throw new Error('Failed to create demo location');

  const existingRegister = await db
    .select()
    .from(schema.registers)
    .where(
      and(
        eq(schema.registers.organizationId, organization.id),
        eq(schema.registers.storeId, store.id),
        eq(schema.registers.code, 'R1'),
      ),
    )
    .limit(1);
  const register =
    existingRegister[0] ??
    (
      await db
        .insert(schema.registers)
        .values({
          organizationId: organization.id,
          storeId: store.id,
          name: 'Register 1',
          code: 'R1',
        })
        .returning()
    )[0];
  if (!register) throw new Error('Failed to create demo register');

  const categoryIds = new Map<string, string>();
  for (const name of DEMO_CATEGORIES) {
    const existingCategory = await db
      .select()
      .from(schema.categories)
      .where(
        and(
          eq(schema.categories.organizationId, organization.id),
          eq(schema.categories.name, name),
        ),
      )
      .limit(1);
    const category =
      existingCategory[0] ??
      (
        await db
          .insert(schema.categories)
          .values({ organizationId: organization.id, name })
          .returning()
      )[0];
    if (!category) throw new Error(`Failed to create category ${name}`);
    categoryIds.set(name, category.id);
  }

  const inventory = createDrizzleInventoryRepository(db);
  for (const item of DEMO_PRODUCTS) {
    const existingProduct = await db
      .select()
      .from(schema.products)
      .where(
        and(eq(schema.products.organizationId, organization.id), eq(schema.products.sku, item.sku)),
      )
      .limit(1);
    const product =
      existingProduct[0] ??
      (
        await db
          .insert(schema.products)
          .values({
            organizationId: organization.id,
            sku: item.sku,
            name: item.name,
            barcode: item.barcode,
            priceMinor: item.priceMinor,
            costMinor: 'costMinor' in item ? item.costMinor : null,
            categoryId: categoryIds.get(item.category),
          })
          .returning()
      )[0];
    if (!product) throw new Error(`Failed to create product ${item.sku}`);

    const balances = await inventory.ledger.listBalances(
      organization.id,
      { locationId: location.id, productId: product.id },
      { limit: 1, offset: 0 },
    );
    if (!balances.items[0]) {
      await inventory.ledger.recordMovement({
        organizationId: organization.id,
        locationId: location.id,
        productId: product.id,
        movementType: 'receipt',
        quantityDelta: BigInt(item.quantity) * 10_000n,
        reason: 'Demo opening stock',
      });
    }
  }

  const existingUser = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, options.email))
    .limit(1);
  let user = existingUser[0];
  if (user) {
    const updated = await db
      .update(schema.users)
      .set({ passwordHash: options.passwordHash, isActive: true })
      .where(eq(schema.users.id, user.id))
      .returning();
    user = updated[0] ?? user;
  } else {
    user = (
      await db
        .insert(schema.users)
        .values({
          email: options.email,
          passwordHash: options.passwordHash,
          displayName: 'Demo Owner',
        })
        .returning()
    )[0];
  }
  if (!user) throw new Error('Failed to create demo user');

  await db
    .insert(schema.memberships)
    .values({ userId: user.id, organizationId: organization.id })
    .onConflictDoNothing();

  const existingRole = await db
    .select()
    .from(schema.roles)
    .where(and(eq(schema.roles.organizationId, organization.id), eq(schema.roles.name, 'Owner')))
    .limit(1);
  const role =
    existingRole[0] ??
    (
      await db
        .insert(schema.roles)
        .values({ organizationId: organization.id, name: 'Owner', isSystem: true })
        .returning()
    )[0];
  if (!role) throw new Error('Failed to create demo role');

  await db
    .insert(schema.rolePermissions)
    .values(PERMISSION_KEYS.map((key) => ({ roleId: role.id, permissionKey: key })))
    .onConflictDoNothing();

  const existingAssignment = await db
    .select()
    .from(schema.userRoleAssignments)
    .where(
      and(
        eq(schema.userRoleAssignments.userId, user.id),
        eq(schema.userRoleAssignments.roleId, role.id),
      ),
    )
    .limit(1);
  if (!existingAssignment[0]) {
    await db
      .insert(schema.userRoleAssignments)
      .values({ userId: user.id, roleId: role.id, organizationId: organization.id });
  }

  return {
    organizationId: organization.id,
    userId: user.id,
    locationId: location.id,
    registerId: register.id,
  };
}
