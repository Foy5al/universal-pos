import { and, eq, gte, inArray, lte, sql, type SQL } from 'drizzle-orm';

import type { Database } from '../../client';
import { refunds } from '../../schema/refunds';
import { saleLines, sales } from '../../schema/sales';
import { formatScaledQuantity, parseScaledQuantity } from '../inventory/quantity';
import type {
  ReportsRepository,
  SalesDayRecord,
  SalesSummaryRecord,
  ShiftActivityRecord,
} from './reports';

const DAY = sql<string>`to_char(${sales.createdAt} at time zone 'UTC', 'YYYY-MM-DD')`;
const REFUND_DAY = sql<string>`to_char(${refunds.createdAt} at time zone 'UTC', 'YYYY-MM-DD')`;

export function createDrizzleReportsRepository(db: Database): ReportsRepository {
  return {
    async shiftActivity(organizationId, registerShiftId): Promise<ShiftActivityRecord> {
      const saleRows = await db
        .select({
          count: sql<number>`count(*)::int`,
          total: sql<string>`coalesce(sum(${sales.totalMinor}), 0)`,
        })
        .from(sales)
        .where(
          and(
            eq(sales.organizationId, organizationId),
            eq(sales.registerShiftId, registerShiftId),
            eq(sales.status, 'completed'),
          ),
        );
      const unitRows = await db
        .select({ units: sql<string>`coalesce(sum(${saleLines.quantity}), 0)` })
        .from(saleLines)
        .innerJoin(sales, eq(sales.id, saleLines.saleId))
        .where(
          and(
            eq(sales.organizationId, organizationId),
            eq(sales.registerShiftId, registerShiftId),
            eq(sales.status, 'completed'),
          ),
        );
      const refundRows = await db
        .select({
          count: sql<number>`count(*)::int`,
          total: sql<string>`coalesce(sum(${refunds.amountMinor}), 0)`,
        })
        .from(refunds)
        .where(
          and(
            eq(refunds.organizationId, organizationId),
            eq(refunds.registerShiftId, registerShiftId),
          ),
        );

      return {
        saleCount: saleRows[0]?.count ?? 0,
        refundCount: refundRows[0]?.count ?? 0,
        unitsSold: formatScaledQuantity(parseScaledQuantity(unitRows[0]?.units ?? '0')),
        grossSalesMinor: Number(saleRows[0]?.total ?? 0),
        refundsMinor: Number(refundRows[0]?.total ?? 0),
      };
    },

    async salesSummary(organizationId, input): Promise<SalesSummaryRecord> {
      if (input.locationIds?.length === 0) {
        return {
          saleCount: 0,
          refundCount: 0,
          grossSalesMinor: 0,
          refundsMinor: 0,
          unitsSold: '0',
          days: [],
        };
      }
      const from = new Date(input.from);
      const to = new Date(input.to);
      const saleWhere: SQL[] = [
        eq(sales.organizationId, organizationId),
        eq(sales.status, 'completed'),
        gte(sales.createdAt, from),
        lte(sales.createdAt, to),
      ];
      if (input.locationIds) saleWhere.push(inArray(sales.locationId, [...input.locationIds]));

      const refundWhere: SQL[] = [
        eq(refunds.organizationId, organizationId),
        gte(refunds.createdAt, from),
        lte(refunds.createdAt, to),
      ];
      if (input.locationIds) refundWhere.push(inArray(sales.locationId, [...input.locationIds]));

      const saleDays = await db
        .select({
          day: DAY,
          count: sql<number>`count(*)::int`,
          total: sql<string>`coalesce(sum(${sales.totalMinor}), 0)`,
        })
        .from(sales)
        .where(and(...saleWhere))
        .groupBy(DAY);
      const unitDays = await db
        .select({
          day: DAY,
          units: sql<string>`coalesce(sum(${saleLines.quantity}), 0)`,
        })
        .from(saleLines)
        .innerJoin(sales, eq(sales.id, saleLines.saleId))
        .where(and(...saleWhere))
        .groupBy(DAY);
      const refundDays = await db
        .select({
          day: REFUND_DAY,
          count: sql<number>`count(distinct ${refunds.id})::int`,
          total: sql<string>`coalesce(sum(${refunds.amountMinor}), 0)`,
        })
        .from(refunds)
        .innerJoin(sales, eq(sales.id, refunds.saleId))
        .where(and(...refundWhere))
        .groupBy(REFUND_DAY);

      const days = new Map<string, SalesDayRecord>();
      const bucket = (date: string): SalesDayRecord => {
        const existing = days.get(date);
        if (existing) return existing;
        const created: SalesDayRecord = {
          date,
          saleCount: 0,
          refundCount: 0,
          grossSalesMinor: 0,
          refundsMinor: 0,
          unitsSold: '0',
        };
        days.set(date, created);
        return created;
      };
      for (const row of saleDays) {
        const day = bucket(row.day);
        day.saleCount = row.count;
        day.grossSalesMinor = Number(row.total);
      }
      for (const row of unitDays) {
        bucket(row.day).unitsSold = formatScaledQuantity(parseScaledQuantity(row.units));
      }
      for (const row of refundDays) {
        const day = bucket(row.day);
        day.refundCount = row.count;
        day.refundsMinor = Number(row.total);
      }

      const items = [...days.values()].sort((left, right) => left.date.localeCompare(right.date));
      return {
        saleCount: items.reduce((total, day) => total + day.saleCount, 0),
        refundCount: items.reduce((total, day) => total + day.refundCount, 0),
        grossSalesMinor: items.reduce((total, day) => total + day.grossSalesMinor, 0),
        refundsMinor: items.reduce((total, day) => total + day.refundsMinor, 0),
        unitsSold: sumUnits(items.map((day) => day.unitsSold)),
        days: items,
      };
    },
  };
}

function sumUnits(values: readonly string[]): string {
  return formatScaledQuantity(values.reduce((sum, value) => sum + parseScaledQuantity(value), 0n));
}
