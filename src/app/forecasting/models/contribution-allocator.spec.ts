import {
  ContributionAllocator,
  RoomCell,
  computeTerminalTaxRatios,
} from './contribution-allocator';

const cell = (
  ownerCode: string,
  type: 'tax-free' | 'tax-deferred',
  startingRoom: number,
  annualGrowth = 0,
): RoomCell => ({ ownerCode, type, startingRoom, annualGrowth });

describe('ContributionAllocator', () => {
  it('allocates fully to the tagged type while under the room', () => {
    const allocator = new ContributionAllocator([cell('S', 'tax-free', 10000)]);
    allocator.allocate(1, {
      ownerCode: 'S',
      type: 'tax-free',
      annualContribution: 6000,
    });
    expect(allocator.getSplit()).toEqual({
      taxFree: 6000,
      taxDeferred: 0,
      taxable: 0,
    });
  });

  it('overflows the remainder to taxable once room is exhausted', () => {
    const allocator = new ContributionAllocator([cell('S', 'tax-deferred', 5000)]);
    // Year 1: 5000 room, contribute 8000 -> 5000 deferred + 3000 taxable.
    allocator.allocate(1, {
      ownerCode: 'S',
      type: 'tax-deferred',
      annualContribution: 8000,
    });
    // Year 2: no growth, no room left -> all 8000 overflows.
    allocator.allocate(2, {
      ownerCode: 'S',
      type: 'tax-deferred',
      annualContribution: 8000,
    });
    expect(allocator.getSplit()).toEqual({
      taxFree: 0,
      taxDeferred: 5000,
      taxable: 11000,
    });
  });

  it('adds a flat dollar amount of new room each year', () => {
    const allocator = new ContributionAllocator([cell('D', 'tax-free', 7000, 500)]);
    // Year 1 room 7000, year 2 adds 500.
    allocator.allocate(1, { ownerCode: 'D', type: 'tax-free', annualContribution: 100000 });
    allocator.allocate(2, { ownerCode: 'D', type: 'tax-free', annualContribution: 100000 });
    expect(allocator.getSplit().taxFree).toBe(7500);
  });

  it('carries accumulated room forward', () => {
    const allocator = new ContributionAllocator([cell('S', 'tax-free', 7000)]);
    // Skip year 1; year 2 still has the full 7000 available.
    allocator.allocate(2, { ownerCode: 'S', type: 'tax-free', annualContribution: 7000 });
    expect(allocator.getSplit()).toEqual({
      taxFree: 7000,
      taxDeferred: 0,
      taxable: 0,
    });
  });

  it('treats a (person, type) with no cell as uncapped', () => {
    const allocator = new ContributionAllocator([]);
    allocator.allocate(1, {
      ownerCode: 'S',
      type: 'tax-free',
      annualContribution: 50000,
    });
    expect(allocator.getSplit()).toEqual({
      taxFree: 50000,
      taxDeferred: 0,
      taxable: 0,
    });
  });

  it('sends everything to taxable for a zero-room cell', () => {
    const allocator = new ContributionAllocator([cell('S', 'tax-free', 0)]);
    allocator.allocate(1, {
      ownerCode: 'S',
      type: 'tax-free',
      annualContribution: 6000,
    });
    expect(allocator.getSplit()).toEqual({
      taxFree: 0,
      taxDeferred: 0,
      taxable: 6000,
    });
  });

  it('keeps each person and type independent (no cascade)', () => {
    const allocator = new ContributionAllocator([
      cell('S', 'tax-free', 1000),
      cell('S', 'tax-deferred', 9999),
    ]);
    // S tax-free maxes at 1000; the 2000 excess must go to TAXABLE, never to
    // S's roomy tax-deferred cell.
    allocator.allocate(1, {
      ownerCode: 'S',
      type: 'tax-free',
      annualContribution: 3000,
    });
    expect(allocator.getSplit()).toEqual({
      taxFree: 1000,
      taxDeferred: 0,
      taxable: 2000,
    });
  });

  it('seeds the split with existing balances', () => {
    const allocator = new ContributionAllocator([], {
      taxFree: 100,
      taxDeferred: 200,
      taxable: 300,
    });
    expect(allocator.getRatios()).toEqual({
      taxFreeRatio: 100 / 600,
      taxDeferredRatio: 200 / 600,
      investmentIncomeRatio: 300 / 600,
    });
  });
});

describe('computeTerminalTaxRatios', () => {
  it('returns null when nothing has been allocated', () => {
    expect(computeTerminalTaxRatios({ cells: [], streams: [], years: 5 })).toBeNull();
  });

  it('accumulates contributions to the retirement horizon', () => {
    const ratios = computeTerminalTaxRatios({
      cells: [cell('S', 'tax-free', 1000)],
      streams: [{ ownerCode: 'S', type: 'tax-free', annualContribution: 1000 }],
      years: 3,
    });
    // Year 1 uses the 1000 room; years 2-3 (no growth) overflow 1000 each.
    expect(ratios).toEqual({
      taxFreeRatio: 1000 / 3000,
      taxDeferredRatio: 0,
      investmentIncomeRatio: 2000 / 3000,
    });
  });

  it('compounds contributions by the growth rate', () => {
    const ratios = computeTerminalTaxRatios({
      cells: [],
      streams: [{ ownerCode: 'S', type: 'taxable', annualContribution: 1000 }],
      years: 2,
      contributionGrowthRate: 0.1,
    });
    // Year 1: 1000, year 2: 1100 -> all taxable.
    expect(ratios.investmentIncomeRatio).toBe(1);
  });
});

describe('computeTerminalTaxRatios with retirements', () => {
  it('keeps the working partner payroll and routes their surplus to their own buckets', () => {
    const ratios = computeTerminalTaxRatios({
      cells: [],
      streams: [
        { ownerCode: 'A', type: 'tax-free', annualContribution: 24000 },
        { ownerCode: 'B', type: 'tax-deferred', annualContribution: 18000 },
        { ownerCode: 'B', type: 'tax-free', annualContribution: 6000 },
      ],
      years: 1,
      retirements: [{ ownerCode: 'A', year: 0 }],
      annualTakeHomeByOwner: { A: 72000, B: 84000 },
      annualCosts: 60000,
    });

    expect(ratios.taxFreeRatio).toBeCloseTo(24000 / 42000);
    expect(ratios.taxDeferredRatio).toBeCloseTo(18000 / 42000);
    expect(ratios.investmentIncomeRatio).toBeCloseTo(0);
  });
});

describe('computeTerminalTaxRatios with a retirement shortfall', () => {
  it('drops bank saving and shrinks payroll net of tax', () => {
    const ratios = computeTerminalTaxRatios({
      cells: [],
      streams: [
        { ownerCode: 'B', type: 'tax-free', annualContribution: 1000 },
        { ownerCode: 'B', type: 'tax-deferred', annualContribution: 6000 },
      ],
      years: 1,
      retirements: [{ ownerCode: 'A', year: 0 }],
      annualTakeHomeByOwner: { B: 60000 },
      annualCosts: 62200,
      taxDeferredCashRate: 0.6,
    });

    expect(ratios.taxFreeRatio).toBeCloseTo(0);
    expect(ratios.taxDeferredRatio).toBeCloseTo(1);
  });
});

describe('computeTerminalTaxRatios with growth', () => {
  it('compounds money invested today ahead of later contributions', () => {
    const ratios = computeTerminalTaxRatios({
      cells: [],
      streams: [{ ownerCode: 'S', type: 'tax-deferred', annualContribution: 20000 }],
      startingBalances: { taxFree: 200000 },
      years: 20,
      annualReturnRate: 0.07,
    });

    expect(ratios.taxDeferredRatio).toBeLessThan(0.55);
    expect(ratios.taxDeferredRatio).toBeGreaterThan(0.45);
  });
});

describe('computeTerminalTaxRatios with a household adjustment', () => {
  it('fills tax-free room first, then overflows to taxable', () => {
    const ratios = computeTerminalTaxRatios({
      cells: [cell('A', 'tax-free', 7000), cell('B', 'tax-free', 3000)],
      streams: [],
      years: 1,
      householdAdjustments: [{ startYear: 0, annualContribution: 30000 }],
    });

    expect(ratios.taxFreeRatio).toBeCloseTo(10000 / 30000);
    expect(ratios.investmentIncomeRatio).toBeCloseTo(20000 / 30000);
  });
});
