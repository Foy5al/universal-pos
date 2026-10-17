import { and, eq } from 'drizzle-orm';

import type { Database } from '../client';
import { users } from '../schema/identity';

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string;
  isActive: boolean;
}

export interface UserRepository {
  findActiveByEmail(email: string): Promise<UserRecord | null>;
  findById(id: string): Promise<UserRecord | null>;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function toUserRecord(row: typeof users.$inferSelect): UserRecord {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.passwordHash,
    displayName: row.displayName,
    isActive: row.isActive,
  };
}

export class InMemoryUserRepository implements UserRepository {
  private readonly records: UserRecord[];

  constructor(records: readonly UserRecord[] = []) {
    this.records = records.map((record) => ({
      ...record,
      email: normalizeEmail(record.email),
    }));
  }

  async findActiveByEmail(email: string): Promise<UserRecord | null> {
    const target = normalizeEmail(email);
    return this.records.find((record) => record.email === target && record.isActive) ?? null;
  }

  async findById(id: string): Promise<UserRecord | null> {
    return this.records.find((record) => record.id === id) ?? null;
  }
}

export function createDrizzleUserRepository(db: Database): UserRepository {
  return {
    async findActiveByEmail(email) {
      const rows = await db
        .select()
        .from(users)
        .where(and(eq(users.email, normalizeEmail(email)), eq(users.isActive, true)))
        .limit(1);
      const row = rows[0];
      return row ? toUserRecord(row) : null;
    },
    async findById(id) {
      const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
      const row = rows[0];
      return row ? toUserRecord(row) : null;
    },
  };
}
