// enabled  -> applied to the main forecast (and the comparison baseline).
// disabled -> ignored everywhere.
// compare  -> applied ONLY to the scenario side of the comparison, so the tool
//             answers "what does adding this row do?" against the enabled world.
export type AdjustmentState = 'enabled' | 'disabled' | 'compare';

// A generic dated life-event dial. Originally just a monthly-contribution nudge,
// now the single authoring object for every scenario effect the engine
// understands: a recurring contribution change, a one-time net-worth move (a
// windfall or a house down payment), and/or a standing expense change. A house
// purchase is simply a row with a negative net-worth adjustment plus a negative
// monthly adjustment — no property-specific fields needed.
export interface ContributionAdjustment {
  name: string;
  startDate: Date;
  // Optional: the monthly adjustment stops applying on/after this date. Absent =
  // open-ended (the historical behavior). Lets a bounded flow — e.g. a mortgage
  // payment that ends at payoff — turn itself off.
  endDate?: Date;
  // Recurring change to the monthly contribution, in today's dollars, applied
  // from startDate to endDate (negative = you can save less).
  monthlyAdjustment: number;
  retiringOwner?: string;
  // Standing annual change to retirement expenses; raises/lowers the FI number.
  expenseAdjustment?: number;
  // One-time principal moving in/out of the investment pool at startDate, in
  // today's dollars (positive = windfall in, negative = down payment out).
  netWorthAdjustment?: number;
  state?: AdjustmentState;
}

export class ContributionAdjustmentUtility {
  public static getAdjustmentForMonth(
    adjustments: ContributionAdjustment[],
    forecastDate: Date
  ): number {
    if (!adjustments || adjustments.length === 0) {
      return 0;
    }

    let totalAdjustment = 0;
    adjustments.forEach((adjustment) => {
      const started = forecastDate >= adjustment.startDate;
      const ended = adjustment.endDate && forecastDate >= adjustment.endDate;
      if (started && !ended) {
        totalAdjustment += adjustment.monthlyAdjustment;
      }
    });

    return totalAdjustment;
  }

  public static getRetiredOwners(
    adjustments: ContributionAdjustment[],
    forecastDate: Date
  ): Set<string> {
    const retired = new Set<string>();
    (adjustments || []).forEach((adjustment) => {
      if (adjustment.retiringOwner && forecastDate >= adjustment.startDate) {
        retired.add(adjustment.retiringOwner);
      }
    });
    return retired;
  }

  public static sortAdjustments(
    adjustments: ContributionAdjustment[]
  ): ContributionAdjustment[] {
    return adjustments.sort(
      (a, b) => a.startDate.getTime() - b.startDate.getTime()
    );
  }
}

function parseStoredDate(value: string | Date): Date {
  return typeof value === 'string' ? new Date(value) : value;
}

function toStoredDate(value: Date | string): string {
  return value instanceof Date ? value.toISOString().split('T')[0] : value;
}

export function parseStoredAdjustments(stored: string | null): ContributionAdjustment[] {
  if (!stored) {
    return [];
  }
  try {
    return JSON.parse(stored).map((adj) => ({
      name: adj.name,
      startDate: parseStoredDate(adj.startDate),
      endDate: adj.endDate ? parseStoredDate(adj.endDate) : undefined,
      monthlyAdjustment: adj.monthlyAdjustment || 0,
      retiringOwner: adj.retiringOwner || undefined,
      expenseAdjustment: adj.expenseAdjustment || 0,
      netWorthAdjustment: adj.netWorthAdjustment || 0,
      state: adj.state || 'enabled',
    }));
  } catch (e) {
    console.error('Failed to parse contribution adjustments', e);
    return [];
  }
}

export function serializeAdjustments(adjustments: ContributionAdjustment[]): string {
  return JSON.stringify(
    adjustments.map((adj) => ({
      name: adj.name,
      startDate: toStoredDate(adj.startDate),
      endDate: adj.endDate ? toStoredDate(adj.endDate) : undefined,
      monthlyAdjustment: adj.monthlyAdjustment || 0,
      retiringOwner: adj.retiringOwner || undefined,
      expenseAdjustment: adj.expenseAdjustment || 0,
      netWorthAdjustment: adj.netWorthAdjustment || 0,
      state: adj.state || 'enabled',
    }))
  );
}
