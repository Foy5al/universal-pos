import type { ReportExportFormat, ReportExportKind } from '@pos/contracts';

import { ApiError, getToken } from '../lib/api';

function attachmentFilename(header: string | null, fallback: string): string {
  const match = header ? /filename="([^"]+)"/.exec(header) : null;
  return match?.[1] ?? fallback;
}

/** Downloads a report export through the authenticated Next.js API proxy. */
export async function downloadReport(
  kind: ReportExportKind,
  format: ReportExportFormat,
  range: { from: string; to: string; locationId?: string },
): Promise<string> {
  const token = getToken();
  const params = new URLSearchParams({ from: range.from, to: range.to, format });
  if (range.locationId) params.set('locationId', range.locationId);

  const response = await fetch(`/api/v1/reports/${kind}/export?${params.toString()}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: { code?: string; message?: string };
    } | null;
    throw new ApiError(
      payload?.error?.message ?? `Export failed (${response.status})`,
      payload?.error?.code ?? 'internal_error',
      response.status,
    );
  }

  const filename = attachmentFilename(
    response.headers.get('content-disposition'),
    `${kind}.${format}`,
  );
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return filename;
}
