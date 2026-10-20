import type { RefundRecord } from '../refunds/refund';
import type { SaleRecord } from '../sales/sale';
import { formatScaledQuantity, parseScaledQuantity } from '../inventory/quantity';

export interface ShiftActivityRecord {
  saleCount: number;
  refundCount: number;
  unitsSold: string;
  grossSalesMinor: number;
  refundsMinor: number;
}

export interface SalesSummaryInput {
  from: string;
  to: string;
  locationIds?: readonly string[] | undefined;
}

export interface SalesDayRecord {
  date: string;
  saleCount: number;
  refundCount: number;
  grossSalesMinor: number;
  refundsMinor: number;
  unitsSold: string;
}

export interface SalesSummaryRecord {
  saleCount: number;
  refundCount: number;
  grossSalesMinor: number;
  refundsMinor: number;
  unitsSold: string;
  days: SalesDayRecord[];
}

export interface ReportsRepository {
  shiftActivity(organizationId: string, registerShiftId: string): Promise<ShiftActivityRecord>;
  salesSummary(organizationId: string, input: SalesSummaryInput): Promise<SalesSummaryRecord>;
}

interface DayBucket {
  saleCount: number;
  refundCount: number;
  grossSalesMinor: number;
  refundsMinor: number;
  units: bigint;
}

export class InMemoryReportsRepository implements ReportsRepository {
  constructor(
    private readonly sales: () => readonly SaleRecord[],
    private readonly refunds: () => readonly RefundRecord[],
  ) {}

  async shiftActivity(
    organizationId: string,
    registerShiftId: string,
  ): Promise<ShiftActivityRecord> {
    const sales = this.sales().filter(
      (record) =>
        record.organizationId === organizationId && record.registerShiftId === registerShiftId,
    );
    const refunds = this.refunds().filter(
      (record) =>
        record.organizationId === organizationId && record.registerShiftId === registerShiftId,
    );
    return {
      saleCount: sales.length,
      refundCount: refunds.length,
      unitsSold: this.unitsOf(sales),
      grossSalesMinor: sales.reduce((total, record) => total + record.totalMinor, 0),
      refundsMinor: refunds.reduce((total, record) => total + record.amountMinor, 0),
    };
  }

  async salesSummary(
    organizationId: string,
    input: SalesSummaryInput,
  ): Promise<SalesSummaryRecord> {
    const salesById = new Map(
      this.sales()
        .filter((record) => record.organizationId === organizationId)
        .map((record) => [record.id, record]),
    );
    const allowedLocations = input.locationIds;
    const inScope = (locationId: string): boolean =>
      !allowedLocations || allowedLocations.includes(locationId);
    const sales = [...salesById.values()].filter(
      (record) =>
        record.createdAt >= input.from &&
        record.createdAt <= input.to &&
        inScope(record.locationId),
    );
    const refunds = this.refunds().filter((record) => {
      const locationId = salesById.get(record.saleId)?.locationId;
      return (
        record.organizationId === organizationId &&
        record.createdAt >= input.from &&
        record.createdAt <= input.to &&
        locationId !== undefined &&
        inScope(locationId)
      );
    });

    const days = new Map<string, DayBucket>();
    const bucketFor = (date: string): DayBucket => {
      const existing = days.get(date);
      if (existing) return existing;
      const created: DayBucket = {
        saleCount: 0,
        refundCount: 0,
        grossSalesMinor: 0,
        refundsMinor: 0,
        units: 0n,
      };
      days.set(date, created);
      return created;
    };
    for (const sale of sales) {
      const bucket = bucketFor(sale.createdAt.slice(0, 10));
      bucket.saleCount += 1;
      bucket.grossSalesMinor += sale.totalMinor;
      bucket.units += this.lineUnits(sale);
    }
    for (const refund of refunds) {
      const bucket = bucketFor(refund.createdAt.slice(0, 10));
      bucket.refundCount += 1;
      bucket.refundsMinor += refund.amountMinor;
    }

    const dayRecords = [...days.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([date, bucket]) => ({
        date,
        saleCount: bucket.saleCount,
        refundCount: bucket.refundCount,
        grossSalesMinor: bucket.grossSalesMinor,
        refundsMinor: bucket.refundsMinor,
        unitsSold: formatScaledQuantity(bucket.units),
      }));

    return {
      saleCount: sales.length,
      refundCount: refunds.length,
      grossSalesMinor: sales.reduce((total, record) => total + record.totalMinor, 0),
      refundsMinor: refunds.reduce((total, record) => total + record.amountMinor, 0),
      unitsSold: this.unitsOf(sales),
      days: dayRecords,
    };
  }

  private unitsOf(sales: readonly SaleRecord[]): string {
    return formatScaledQuantity(sales.reduce((total, sale) => total + this.lineUnits(sale), 0n));
  }

  private lineUnits(sale: SaleRecord): bigint {
    return sale.lines.reduce((total, line) => total + parseScaledQuantity(line.quantity), 0n);
  }
}
