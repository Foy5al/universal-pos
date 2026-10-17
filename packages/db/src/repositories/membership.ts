import { and, eq } from 'drizzle-orm';

import type { Database } from '../client';
import { memberships } from '../schema/identity';
import { organizations } from '../schema/tenancy';

export interface OrganizationRef {
  id: string;
  slug: string;
}

export interface MembershipRepository {
  listOrganizationIds(userId: string): Promise<string[]>;
  findOrganizationBySlug(slug: string): Promise<OrganizationRef | null>;
  isMember(userId: string, organizationId: string): Promise<boolean>;
}

export class InMemoryMembershipRepository implements MembershipRepository {
  private readonly memberships: Array<{ userId: string; organizationId: string }>;
  private readonly organizations: OrganizationRef[];

  constructor(input: {
    memberships?: ReadonlyArray<{ userId: string; organizationId: string }>;
    organizations?: readonly OrganizationRef[];
  } = {}) {
    this.memberships = [...(input.memberships ?? [])];
    this.organizations = [...(input.organizations ?? [])];
  }

  async listOrganizationIds(userId: string): Promise<string[]> {
    return this.memberships
      .filter((membership) => membership.userId === userId)
      .map((membership) => membership.organizationId);
  }

  async findOrganizationBySlug(slug: string): Promise<OrganizationRef | null> {
    return this.organizations.find((org) => org.slug === slug) ?? null;
  }

  async isMember(userId: string, organizationId: string): Promise<boolean> {
    return this.memberships.some(
      (membership) =>
        membership.userId === userId && membership.organizationId === organizationId,
    );
  }
}

export function createDrizzleMembershipRepository(db: Database): MembershipRepository {
  return {
    async listOrganizationIds(userId) {
      const rows = await db
        .select({ organizationId: memberships.organizationId })
        .from(memberships)
        .where(eq(memberships.userId, userId));
      return rows.map((row) => row.organizationId);
    },
    async findOrganizationBySlug(slug) {
      const rows = await db
        .select({ id: organizations.id, slug: organizations.slug })
        .from(organizations)
        .where(eq(organizations.slug, slug))
        .limit(1);
      const row = rows[0];
      return row ? { id: row.id, slug: row.slug } : null;
    },
    async isMember(userId, organizationId) {
      const rows = await db
        .select({ id: memberships.id })
        .from(memberships)
        .where(
          and(
            eq(memberships.userId, userId),
            eq(memberships.organizationId, organizationId),
          ),
        )
        .limit(1);
      return rows.length > 0;
    },
  };
}
