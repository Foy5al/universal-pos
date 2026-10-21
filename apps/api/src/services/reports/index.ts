import type {
  Principal,
  ReportExportKind,
  ReportExportQuery,
  ReportRangeQuery,
  SalesSummary,
  ShiftReport,
  StoreActivity,
} from '@pos/contracts';
import type {
  RegisterShiftRepository,
  ReportsRepository,
  StockLedgerRepository,
  StockLocationRepository,
} from '@pos/db';

import { notFound, validationError } from '../../core/errors';
import { hasStoreScope } from '../../core/principal';
import type { ReportDocument } from '../../exports/tabular';
import { salesSummaryDocument, storeActivityDocument } from './exportDocument';

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_RANGE_DAYS = 366;

export interface ReportsService {
  salesSummary(principal: Principal, query: ReportRangeQuery): Promise<SalesSummary>;
  storeActivity(principal: Principal, query: ReportRangeQuery): Promise<StoreActivity>;
  shiftReport(principal: Principal, shiftId: string): Promise<ShiftReport>;
  exportReport(
    principal: Principal,
    kind: ReportExportKind,
    query: ReportExportQuery,
  ): Promise<ReportDocument>;
}

export interface ReportsServiceOptions {
  now?: () => Date;
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function createReportsService(
  repo: ReportsRepository,
  shifts: RegisterShiftRepository,
  locations: StockLocationRepository,
  ledger: StockLedgerRepository,
  options: ReportsServiceOptions = {},
): ReportsService {
  const now = options.now ?? (() => new Date());

  function resolveRange(query: ReportRangeQuery): { start: string; end: string } {
    const end = query.to ? new Date(query.to) : now();
    const start = query.from
      ? new Date(query.from)
      : new Date(startOfUtcDay(new Date(end.getTime() - 6 * DAY_MS)).getTime());
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw validationError('Report range must contain valid dates');
    }
    if (start > end) {
      throw validationError('Report start must be before the end');
    }
    if (end.getTime() - start.getTime() > MAX_RANGE_DAYS * DAY_MS) {
      throw validationError('Report range cannot exceed 366 days');
    }
    return { start: start.toISOString(), end: end.toISOString() };
  }

  async function resolveLocationIds(
    principal: Principal,
    requested: string | undefined,
  ): Promise<string[] | undefined> {
    if (requested) {
      const location = await locations.findById(principal.organizationId, requested);
      const scoped =
        location !== null &&
        (location.storeId === null
          ? principal.storeIds.length === 0
          : hasStoreScope(principal, location.storeId));
      if (!scoped) {
        throw notFound('Stock location not found');
      }
      return [requested];
    }
    if (principal.storeIds.length === 0) return undefined;
    const allowed = await locations.listByStoreIds(principal.organizationId, principal.storeIds);
    return allowed.map((location) => location.id);
  }

  async function buildSalesSummary(
    principal: Principal,
    query: ReportRangeQuery,
    range: { start: string; end: string },
    locationIds: string[] | undefined,
  ): Promise<SalesSummary> {
    const summary = await repo.salesSummary(principal.organizationId, {
      from: range.start,
      to: range.end,
      locationIds,
    });
    return {
      from: range.start,
      to: range.end,
      locationId: query.locationId ?? null,
      saleCount: summary.saleCount,
      refundCount: summary.refundCount,
      grossSalesMinor: summary.grossSalesMinor,
      refundsMinor: summary.refundsMinor,
      netSalesMinor: summary.grossSalesMinor - summary.refundsMinor,
      averageSaleMinor:
        summary.saleCount === 0 ? 0 : Math.round(summary.grossSalesMinor / summary.saleCount),
      unitsSold: summary.unitsSold,
      days: summary.days.map((day) => ({
        ...day,
        netSalesMinor: day.grossSalesMinor - day.refundsMinor,
      })),
    };
  }

  async function buildStoreActivity(
    principal: Principal,
    query: ReportRangeQuery,
    range: { start: string; end: string },
    locationIds: string[] | undefined,
  ): Promise<StoreActivity> {
    const sales = await buildSalesSummary(principal, query, range, locationIds);
    const [losses, receiving] = await Promise.all([
      ledger.summarizeMovements(principal.organizationId, {
        from: range.start,
        to: range.end,
        locationIds,
        onlyLosses: true,
      }),
      ledger.summarizeMovements(principal.organizationId, {
        from: range.start,
        to: range.end,
        locationIds,
        movementType: 'receipt',
      }),
    ]);
    return {
      from: range.start,
      to: range.end,
      locationId: query.locationId ?? null,
      sales: {
        saleCount: sales.saleCount,
        refundCount: sales.refundCount,
        grossSalesMinor: sales.grossSalesMinor,
        refundsMinor: sales.refundsMinor,
        netSalesMinor: sales.netSalesMinor,
        averageSaleMinor: sales.averageSaleMinor,
        unitsSold: sales.unitsSold,
      },
      losses,
      receiving,
    };
  }

  return {
    async salesSummary(principal, query) {
      const range = resolveRange(query);
      const locationIds = await resolveLocationIds(principal, query.locationId);
      return buildSalesSummary(principal, query, range, locationIds);
    },

    async storeActivity(principal, query) {
      const range = resolveRange(query);
      const locationIds = await resolveLocationIds(principal, query.locationId);
      return buildStoreActivity(principal, query, range, locationIds);
    },

    async exportReport(principal, kind, query) {
      const range = resolveRange(query);
      const locationIds = await resolveLocationIds(principal, query.locationId);
      const context = {
        organizationId: principal.organizationId,
        email: principal.email,
        from: range.start,
        to: range.end,
        locationLabel: query.locationId ?? 'All locations in scope',
      };
      if (kind === 'store-activity') {
        const activity = await buildStoreActivity(principal, query, range, locationIds);
        return storeActivityDocument(activity, context);
      }
      const summary = await buildSalesSummary(principal, query, range, locationIds);
      return salesSummaryDocument(summary, context);
    },

    async shiftReport(principal, shiftId) {
      const shift = await shifts.findById(principal.organizationId, shiftId);
      if (!shift || !hasStoreScope(principal, shift.storeId)) {
        throw notFound('Register shift not found');
      }
      const activity = await repo.shiftActivity(principal.organizationId, shiftId);
      return {
        type: shift.status === 'open' ? 'x' : 'z',
        shift,
        saleCount: activity.saleCount,
        refundCount: activity.refundCount,
        unitsSold: activity.unitsSold,
        grossSalesMinor: activity.grossSalesMinor,
        refundsMinor: activity.refundsMinor,
        netSalesMinor: activity.grossSalesMinor - activity.refundsMinor,
      };
    },
  };
}
