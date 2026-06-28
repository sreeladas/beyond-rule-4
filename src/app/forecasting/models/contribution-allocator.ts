// Allocates a forward contribution stream across tax-free / tax-deferred /
// taxable, honoring per-person, point-in-time contribution room that grows each
// year by a rule. When a (person, type) cell's room is exhausted, that stream's
// excess overflows to TAXABLE only — there is no cascade between tax-advantaged
// types. The output is the realized terminal portfolio split, used to derive the
// FI-number tax multiplier. The single-pool growth in Forecast is unaffected;
// this only shapes the tax ratios.

export type TaxAdvantagedType = 'tax-free' | 'tax-deferred';
export type ContributionTaxType = TaxAdvantagedType | 'taxable';

// Contribution room for one (person, type) cell. `startingRoom` is the total
// accumulated room available now; each following year adds a fixed dollar
// amount (`annualGrowth`). Room available at year Y = startingRoom +
// (Y - 1) * annualGrowth, with unused room carrying forward.
export interface RoomCell {
  ownerCode: string;
  type: TaxAdvantagedType;
  startingRoom: number; // total accumulated room available now
  annualGrowth: number; // dollars of new room added each following year
}

export interface ContributionStream {
  ownerCode: string;
  type: ContributionTaxType;
  annualContribution: number; // nominal, at year 0
}

export interface TerminalSplit {
  taxFree: number;
  taxDeferred: number;
  taxable: number;
}

export interface TaxRatios {
  taxFreeRatio: number;
  taxDeferredRatio: number;
  investmentIncomeRatio: number;
}

const cellKey = (ownerCode: string, type: TaxAdvantagedType): string =>
  `${ownerCode}::${type}`;

export class ContributionAllocator {
  private readonly remainingRoom = new Map<string, number>();
  private readonly annualGrowth = new Map<string, number>();
  private readonly split: TerminalSplit;
  private currentYear = 0;

  // `startingBalances` seed the terminal split with dollars already sitting in
  // each wrapper today (not subject to room). Cells with no entry are UNCAPPED:
  // their streams always land fully in their own type and never overflow.
  constructor(cells: RoomCell[], startingBalances?: Partial<TerminalSplit>) {
    this.split = {
      taxFree: startingBalances?.taxFree ?? 0,
      taxDeferred: startingBalances?.taxDeferred ?? 0,
      taxable: startingBalances?.taxable ?? 0,
    };
    for (const cell of cells) {
      const k = cellKey(cell.ownerCode, cell.type);
      this.remainingRoom.set(k, cell.startingRoom);
      this.annualGrowth.set(k, cell.annualGrowth);
    }
  }

  // Year 1 draws against the accumulated starting room. Entering year Y >= 2,
  // each cell gains a flat annualGrowth of new room; unused room carries
  // forward.
  private advanceTo(year: number): void {
    while (this.currentYear < year) {
      this.currentYear++;
      if (this.currentYear < 2) {
        continue;
      }
      for (const [k, growth] of this.annualGrowth) {
        this.remainingRoom.set(k, (this.remainingRoom.get(k) ?? 0) + growth);
      }
    }
  }

  allocate(year: number, stream: ContributionStream): void {
    if (stream.annualContribution <= 0) {
      return;
    }
    this.advanceTo(year);

    if (stream.type === 'taxable') {
      this.split.taxable += stream.annualContribution;
      return;
    }

    const k = cellKey(stream.ownerCode, stream.type);
    if (!this.remainingRoom.has(k)) {
      this.addToType(stream.type, stream.annualContribution); // uncapped
      return;
    }

    const room = this.remainingRoom.get(k);
    const used = Math.min(room, stream.annualContribution);
    this.remainingRoom.set(k, room - used);
    this.addToType(stream.type, used);

    const overflow = stream.annualContribution - used;
    if (overflow > 0) {
      this.split.taxable += overflow;
    }
  }

  private addToType(type: TaxAdvantagedType, amount: number): void {
    if (type === 'tax-free') {
      this.split.taxFree += amount;
    } else {
      this.split.taxDeferred += amount;
    }
  }

  getSplit(): TerminalSplit {
    return { ...this.split };
  }

  getRatios(): TaxRatios | null {
    const total =
      this.split.taxFree + this.split.taxDeferred + this.split.taxable;
    if (total <= 0) {
      return null;
    }
    return {
      taxFreeRatio: this.split.taxFree / total,
      taxDeferredRatio: this.split.taxDeferred / total,
      investmentIncomeRatio: this.split.taxable / total,
    };
  }
}

export interface TerminalSplitOptions {
  cells: RoomCell[];
  streams: ContributionStream[];
  startingBalances?: Partial<TerminalSplit>;
  years: number; // whole contribution years to retirement
  contributionGrowthRate?: number; // ongoing nominal raise on contributions
}

// Runs the allocator forward to retirement and returns the realized tax ratios.
// Approximates the fiNumber fixed point by evaluating the split at the
// retirement horizon (a fixed number of years), rather than iterating on the
// FI date. Growth on balances/contributions is uniform across buckets, so it
// cancels in the ratio and is intentionally omitted from compounding here.
export function computeTerminalTaxRatios(
  opts: TerminalSplitOptions,
): TaxRatios | null {
  const allocator = new ContributionAllocator(opts.cells, opts.startingBalances);
  const growth = opts.contributionGrowthRate ?? 0;
  const years = Math.max(0, Math.floor(opts.years));

  for (let year = 1; year <= years; year++) {
    const growthMultiplier = Math.pow(1 + growth, year - 1);
    for (const stream of opts.streams) {
      allocator.allocate(year, {
        ...stream,
        annualContribution: stream.annualContribution * growthMultiplier,
      });
    }
  }

  return allocator.getRatios();
}
