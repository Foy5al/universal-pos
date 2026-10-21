'use client';

import type { ReportExportFormat, ReportExportKind } from '@pos/contracts';
import { useEffect, useState } from 'react';

import { ApiError, fetchSession, getToken } from '../lib/api';
import { downloadReport } from './downloadReport';

export function useReportExport(from: string, to: string) {
  const [canExport, setCanExport] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastFile, setLastFile] = useState<string | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    let cancelled = false;
    fetchSession(token)
      .then((session) => {
        if (!cancelled) setCanExport(session.user.permissions.includes('reports:export'));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  async function run(kind: ReportExportKind, format: ReportExportFormat): Promise<void> {
    setBusy(`${kind}:${format}`);
    setError(null);
    setLastFile(null);
    try {
      const filename = await downloadReport(kind, format, {
        from: `${from}T00:00:00.000Z`,
        to: `${to}T23:59:59.999Z`,
      });
      setLastFile(filename);
    } catch (cause) {
      setError(
        cause instanceof ApiError && cause.status === 403
          ? 'Your role cannot export reports. Ask an owner or manager for reports:export.'
          : cause instanceof Error
            ? cause.message
            : 'Could not export this report.',
      );
    } finally {
      setBusy(null);
    }
  }

  return { canExport, busy, error, lastFile, run };
}
