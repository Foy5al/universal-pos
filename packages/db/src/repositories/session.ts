import { randomUUID } from 'node:crypto';

import { and, eq, gt, isNull } from 'drizzle-orm';

import type { Database } from '../client';
import { sessions } from '../schema/identity';

export interface SessionRecord {
  id: string;
  userId: string;
  organizationId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

export interface CreateSessionInput {
  userId: string;
  organizationId: string;
  tokenHash: string;
  expiresAt: Date;
}

export interface SessionRepository {
  create(input: CreateSessionInput): Promise<SessionRecord>;
  findActiveByTokenHash(tokenHash: string, now: Date): Promise<SessionRecord | null>;
  revokeByTokenHash(tokenHash: string, at: Date): Promise<void>;
}

function toSessionRecord(row: typeof sessions.$inferSelect): SessionRecord {
  return {
    id: row.id,
    userId: row.userId,
    organizationId: row.organizationId,
    tokenHash: row.tokenHash,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
  };
}

export class InMemorySessionRepository implements SessionRepository {
  private readonly records: SessionRecord[] = [];

  async create(input: CreateSessionInput): Promise<SessionRecord> {
    const record: SessionRecord = {
      id: randomUUID(),
      userId: input.userId,
      organizationId: input.organizationId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      revokedAt: null,
    };
    this.records.push(record);
    return record;
  }

  async findActiveByTokenHash(tokenHash: string, now: Date): Promise<SessionRecord | null> {
    return (
      this.records.find(
        (record) =>
          record.tokenHash === tokenHash &&
          record.revokedAt === null &&
          record.expiresAt.getTime() > now.getTime(),
      ) ?? null
    );
  }

  async revokeByTokenHash(tokenHash: string, at: Date): Promise<void> {
    for (const record of this.records) {
      if (record.tokenHash === tokenHash && record.revokedAt === null) {
        record.revokedAt = at;
      }
    }
  }
}

export function createDrizzleSessionRepository(db: Database): SessionRepository {
  return {
    async create(input) {
      const rows = await db
        .insert(sessions)
        .values({
          userId: input.userId,
          organizationId: input.organizationId,
          tokenHash: input.tokenHash,
          expiresAt: input.expiresAt,
        })
        .returning();
      const row = rows[0];
      if (!row) {
        throw new Error('Failed to insert session');
      }
      return toSessionRecord(row);
    },
    async findActiveByTokenHash(tokenHash, now) {
      const rows = await db
        .select()
        .from(sessions)
        .where(
          and(
            eq(sessions.tokenHash, tokenHash),
            isNull(sessions.revokedAt),
            gt(sessions.expiresAt, now),
          ),
        )
        .limit(1);
      const row = rows[0];
      return row ? toSessionRecord(row) : null;
    },
    async revokeByTokenHash(tokenHash, at) {
      await db
        .update(sessions)
        .set({ revokedAt: at })
        .where(and(eq(sessions.tokenHash, tokenHash), isNull(sessions.revokedAt)));
    },
  };
}
