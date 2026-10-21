import { Router } from 'express';

import {
  reportExportKindSchema,
  reportExportQuerySchema,
  reportRangeQuerySchema,
  resourceIdSchema,
  successEnvelope,
} from '@pos/contracts';

import { toCsv } from '../exports/tabular';
import { toXlsx } from '../exports/xlsx';
import { asyncHandler } from '../http/asyncHandler';
import { requirePrincipal } from '../http/requirePrincipal';
import { authorize } from '../middleware/authorize';
import type { ReportsService } from '../services/reports';

const EXPORT_CONTENT_TYPES = {
  csv: 'text/csv; charset=utf-8',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
} as const;

export function createReportsRouter(service: ReportsService): Router {
  const router = Router();

  router.get(
    '/reports/sales-summary',
    authorize('reports:read'),
    asyncHandler(async (req, res) => {
      const principal = requirePrincipal(req);
      const query = reportRangeQuerySchema.parse(req.query);
      res.json(successEnvelope(await service.salesSummary(principal, query)));
    }),
  );

  router.get(
    '/reports/store-activity',
    authorize('reports:read'),
    asyncHandler(async (req, res) => {
      const principal = requirePrincipal(req);
      const query = reportRangeQuerySchema.parse(req.query);
      res.json(successEnvelope(await service.storeActivity(principal, query)));
    }),
  );

  router.get(
    '/reports/:kind/export',
    authorize('reports:export'),
    asyncHandler(async (req, res) => {
      const principal = requirePrincipal(req);
      const kind = reportExportKindSchema.parse(req.params.kind);
      const query = reportExportQuerySchema.parse(req.query);
      const document = await service.exportReport(principal, kind, query);
      const body = query.format === 'csv' ? toCsv(document) : Buffer.from(await toXlsx(document));

      // Exports are financial data: log who took what, never the row contents.
      console.info(
        JSON.stringify({
          event: 'report.export',
          report: kind,
          format: query.format,
          organizationId: principal.organizationId,
          userId: principal.userId,
          rows: document.rows.length,
          from: query.from ?? null,
          to: query.to ?? null,
        }),
      );

      res.setHeader('content-type', EXPORT_CONTENT_TYPES[query.format]);
      res.setHeader('cache-control', 'no-store');
      res.setHeader(
        'content-disposition',
        `attachment; filename="${document.filenameStem}.${query.format}"`,
      );
      res.send(body);
    }),
  );

  router.get(
    '/reports/shifts/:id',
    authorize('reports:read'),
    asyncHandler(async (req, res) => {
      const principal = requirePrincipal(req);
      const id = resourceIdSchema.parse(req.params.id);
      res.json(successEnvelope(await service.shiftReport(principal, id)));
    }),
  );

  return router;
}
