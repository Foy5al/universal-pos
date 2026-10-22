import type { PosSettings, UpdatePosSettingsRequest } from '@pos/contracts';

import { apiFetch } from '../lib/api';

export function fetchPosSettings(): Promise<PosSettings> {
  return apiFetch('/pos/settings');
}

export function updatePosSettings(input: UpdatePosSettingsRequest): Promise<PosSettings> {
  return apiFetch('/pos/settings', { method: 'PUT', body: input });
}
