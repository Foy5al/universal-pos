import type { PosSettings, UpdatePosSettingsRequest } from '@pos/contracts';
import type { PosSettingsRecord, PosSettingsRepository } from '@pos/db';

import { validationError } from '../core/errors';
import {
  createRemovalPasswordVerifier,
  REMOVAL_PASSWORD_ITERATIONS,
} from '../core/removalPassword';

export interface PosSettingsService {
  get(organizationId: string): Promise<PosSettings>;
  update(organizationId: string, input: UpdatePosSettingsRequest): Promise<PosSettings>;
}

function toContract(organizationId: string, record: PosSettingsRecord | null): PosSettings {
  const enabled = record?.requireRemovalPassword ?? false;
  const hasPassword = Boolean(record?.removalPasswordHash && record?.removalPasswordSalt);
  return {
    organizationId,
    requireRemovalPassword: enabled,
    removalPasswordSet: hasPassword,
    removalPasswordVerifier:
      enabled && hasPassword && record
        ? {
            algorithm: 'pbkdf2-sha256',
            salt: record.removalPasswordSalt as string,
            hash: record.removalPasswordHash as string,
            iterations: record.removalPasswordIterations,
          }
        : null,
    updatedAt: record?.updatedAt ?? null,
  };
}

export function createPosSettingsService(repository: PosSettingsRepository): PosSettingsService {
  return {
    async get(organizationId) {
      return toContract(organizationId, await repository.get(organizationId));
    },
    async update(organizationId, input) {
      const current = await repository.get(organizationId);
      let salt = current?.removalPasswordSalt ?? null;
      let hash = current?.removalPasswordHash ?? null;
      let iterations = current?.removalPasswordIterations ?? REMOVAL_PASSWORD_ITERATIONS;

      if (input.removalPassword) {
        const verifier = await createRemovalPasswordVerifier(input.removalPassword);
        salt = verifier.salt;
        hash = verifier.hash;
        iterations = verifier.iterations;
      }
      if (input.requireRemovalPassword && !hash) {
        throw validationError('Set a removal password before enabling protection');
      }

      const saved = await repository.upsert(organizationId, {
        requireRemovalPassword: input.requireRemovalPassword,
        removalPasswordSalt: salt,
        removalPasswordHash: hash,
        removalPasswordIterations: iterations,
      });
      return toContract(organizationId, saved);
    },
  };
}
