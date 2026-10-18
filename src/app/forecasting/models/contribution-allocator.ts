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
  constructor(
    cells: RoomCell[],
    startingBalances?: Partial<TerminalSplit>,
    private readonly annualReturnRate = 0,
  ) {
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
  advanceTo(year: number): void {
    while (this.currentYear < year) {
      this.currentYear++;
      if (this.currentYear < 2) {
        continue;
      }
      this.split.taxFree *= 1 + this.annualReturnRate;
      this.split.taxDeferred *= 1 + this.annualReturnRate;
      this.split.taxable *= 1 + this.annualReturnRate;
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

  // Move a one-time net-worth amount at the current point in the projection.
  // Positive = a withdrawal draining accessible buckets first (taxable ->
  // tax-free -> tax-deferred); negative = a deposit (windfall) landing in
  // taxable. Called from the year loop so it sees the balances built up by every
  // contribution allocated so far — i.e. "as of the withdrawal date".
  reshape(amount: number): void {
    if (amount < 0) {
      this.split.taxable += -amount;
      return;
    }
    let remaining = amount;
    const order: (keyof TerminalSplit)[] = ['taxable', 'taxFree', 'taxDeferred'];
    for (const bucket of order) {
      if (remaining <= 0) {
        break;
      }
      const take = Math.min(this.split[bucket], remaining);
      this.split[bucket] -= take;
      remaining -= take;
    }
    // Any shortfall beyond the drained buckets is dropped — you cannot pull out
    // what is not there.
  }

  // Fills any household member's tax-free room, then overflows to taxable. With
  // no tax-free room configured at all, tax-free is uncapped like other cells.
  allocateHousehold(year: number, amount: number): void {
    if (amount <= 0) {
      return;
    }
    this.advanceTo(year);
    const taxFreeKeys = [...this.remainingRoom.keys()].filter((k) =>
      k.endsWith('::tax-free'),
    );
    if (taxFreeKeys.length === 0) {
      this.split.taxFree += amount;
      return;
    }
    let remaining = amount;
    for (const k of taxFreeKeys) {
      const used = Math.min(this.remainingRoom.get(k), remaining);
      this.remainingRoom.set(k, this.remainingRoom.get(k) - used);
      this.split.taxFree += used;
      remaining -= used;
    }
    this.split.taxable += remaining;
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

// A dated one-time net-worth move, in today's dollars. `year` is whole years
// from now (0 = now). Positive amount = withdrawal (down payment); negative =
// deposit (windfall). Applied after that year's contributions, so it reshapes
// the split as of its date.
export interface DatedReshape {
  year: number;
  amount: number;
}

export interface TerminalSplitOptions {
  cells: RoomCell[];
  streams: ContributionStream[];
  startingBalances?: Partial<TerminalSplit>;
  years: number; // whole contribution years to retirement
  contributionGrowthRate?: number; // ongoing nominal raise on contributions
  // Dated net-worth moves stacked in time order against the evolving split.
  reshapes?: DatedReshape[];
  retirements?: Retirement[];
  householdAdjustments?: HouseholdAdjustment[];
  annualTakeHomeByOwner?: Record<string, number>;
  annualCosts?: number;
  inflationRate?: number;
  taxDeferredCashRate?: number;
  annualReturnRate?: number; // nominal
}

// A dated monthly contribution adjustment with no owner, in nominal dollars
// per year. Active for years after startYear through endYear (open-ended when
// absent).
export interface HouseholdAdjustment {
  startYear: number;
  endYear?: number;
  annualContribution: number;
}

export interface Retirement {
  ownerCode: string;
  year: number;
}

// Mirrors Forecast's retirement phase: retired owners stop; working owners with
// take-home keep their tax-deferred (payroll) streams and replace the rest with
// their share of take-home minus costs; those without keep saving as today. A
// shortfall first shrinks payroll streams, then is a withdrawal, which doesn't
// reshape the split here.
function streamsForYear(
  opts: TerminalSplitOptions,
  year: number,
  growthMultiplier: number,
): ContributionStream[] {
  const grow = (stream: ContributionStream): ContributionStream => ({
    ...stream,
    annualContribution: stream.annualContribution * growthMultiplier,
  });
  const retired = new Set(
    (opts.retirements ?? [])
      .filter((r) => r.year < year)
      .map((r) => r.ownerCode),
  );
  if (retired.size === 0) {
    return opts.streams.map(grow);
  }

  const takeHome = opts.annualTakeHomeByOwner ?? {};
  const isPayroll = (s: ContributionStream) => s.type === 'tax-deferred';
  const working = opts.streams.filter((s) => !retired.has(s.ownerCode));
  const keepSaving = working.filter((s) => !(s.ownerCode in takeHome)).map(grow);
  const workingOwners = Object.keys(takeHome).filter((o) => !retired.has(o));
  if (workingOwners.length === 0) {
    return keepSaving;
  }
  const payroll = working
    .filter((s) => s.ownerCode in takeHome && isPayroll(s))
    .map(grow);
  const totalTakeHome = workingOwners.reduce(
    (sum, owner) => sum + takeHome[owner] * growthMultiplier,
    0,
  );
  const costs =
    (opts.annualCosts ?? 0) * Math.pow(1 + (opts.inflationRate ?? 0), year - 1);
  const surplus = totalTakeHome - costs;
  if (surplus <= 0) {
    return [
      ...keepSaving,
      ...redirectPayroll(payroll, -surplus, opts.taxDeferredCashRate ?? 1),
    ];
  }

  const result = [...keepSaving, ...payroll];

  for (const owner of workingOwners) {
    const ownerSurplus =
      (surplus * takeHome[owner] * growthMultiplier) / totalTakeHome;
    const bankStreams = working.filter(
      (s) => s.ownerCode === owner && !isPayroll(s),
    );
    const bankTotal = bankStreams.reduce(
      (sum, s) => sum + s.annualContribution,
      0,
    );
    if (bankTotal <= 0) {
      result.push({
        ownerCode: owner,
        type: 'taxable',
        annualContribution: ownerSurplus,
      });
      continue;
    }
    for (const stream of bankStreams) {
      result.push({
        ...stream,
        annualContribution:
          (ownerSurplus * stream.annualContribution) / bankTotal,
      });
    }
  }
  return result;
}

function redirectPayroll(
  payroll: ContributionStream[],
  shortfall: number,
  taxDeferredCashRate: number,
): ContributionStream[] {
  const total = payroll.reduce((sum, s) => sum + s.annualContribution, 0);
  if (total <= 0) {
    return payroll;
  }
  const keptShare =
    1 - Math.min(total, shortfall / taxDeferredCashRate) / total;
  return payroll.map((s) => ({
    ...s,
    annualContribution: s.annualContribution * keptShare,
  }));
}

// Runs the allocator forward to retirement and returns the realized tax ratios.
// Approximates the fiNumber fixed point by evaluating the split at the
// retirement horizon (a fixed number of years), rather than iterating on the
// FI date. Balances compound yearly, so money invested today outweighs a later
// contribution of the same size.
export function computeTerminalTaxRatios(
  opts: TerminalSplitOptions,
): TaxRatios | null {
  const allocator = new ContributionAllocator(
    opts.cells,
    opts.startingBalances,
    opts.annualReturnRate,
  );
  const growth = opts.contributionGrowthRate ?? 0;
  const years = Math.max(0, Math.floor(opts.years));

  // Withdrawals stack in time order; each is applied after the contributions of
  // its year, so it drains the balance that has actually accrued by then.
  const reshapes = (opts.reshapes ?? [])
    .slice()
    .sort((a, b) => a.year - b.year);
  let ri = 0;
  const applyReshapesThrough = (year: number): void => {
    while (ri < reshapes.length && reshapes[ri].year <= year) {
      allocator.reshape(reshapes[ri].amount);
      ri++;
    }
  };

  applyReshapesThrough(0); // moves dated now, before any contributions
  for (let year = 1; year <= years; year++) {
    allocator.advanceTo(year);
    const growthMultiplier = Math.pow(1 + growth, year - 1);
    for (const stream of streamsForYear(opts, year, growthMultiplier)) {
      allocator.allocate(year, stream);
    }
    for (const adjustment of opts.householdAdjustments ?? []) {
      const active =
        adjustment.startYear < year &&
        (adjustment.endYear === undefined || year <= adjustment.endYear);
      if (active) {
        allocator.allocateHousehold(year, adjustment.annualContribution);
      }
    }
    applyReshapesThrough(year);
  }
  applyReshapesThrough(Infinity); // anything dated past the horizon

  return allocator.getRatios();
}
