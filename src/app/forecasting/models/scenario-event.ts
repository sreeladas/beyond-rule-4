import { CalculateInput, NetWorthDelta } from './calculate-input.model';
import { ContributionAdjustment } from './contribution-adjustment.model';
import {
  ContributionTaxType,
  DatedReshape,
  Retirement,
} from './contribution-allocator';

// The generalized scenario seam. A ScenarioEvent is a pure authoring object
// (a house purchase, a windfall, a contribution change) that EMITS the engine
// primitives a forecast already understands. `applyEvents` compiles a list of
// events down onto a cloned CalculateInput; computeForecast then consumes that
// input and never needs to know events exist. Every emitter is optional so a
// simple event only implements the dials it actually moves.
export interface ScenarioEvent {
  // Dated one-time principal moving in/out of the pool (today's dollars).
  netWorthDeltas?(): NetWorthDelta[];
  // Dated monthly contribution changes (may carry an endDate).
  contributionDeltas?(): ContributionAdjustment[];
  // Annual change to retirement expenses; raises/lowers the FI number.
  expenseDelta?(): number;
  // Reshapes the terminal tax split by moving dollars between buckets. A
  // positive amount is withdrawn, draining `order` buckets in sequence; a
  // negative amount is deposited into the first bucket in `order`.
  bucketReshapes?(): BucketReshape[];
}

export interface BucketReshape {
  amount: number; // + drains buckets in `order`; − deposits into order[0]
  order: ContributionTaxType[];
  // When the cash actually moves. With a ReshapeContext the amount is grown
  // from this date to the horizon, so it is sized against the retirement-scale
  // buckets rather than today's.
  date?: Date;
}

// Sizes the tax-ratio reshaping to the pool at the retirement horizon (what the
// terminal ratios actually describe) instead of today's net worth. Supplied by
// a caller that has run the baseline forecast; absent, reshaping falls back to
// the today's-dollars proxy.
export interface ReshapeContext {
  terminalNetWorth: number; // projected pool at the horizon (reconstruction scale)
  horizonDate: Date; // retirement date the dated amounts are grown to
  annualGrowthRate: number; // grows a dated amount from its date to the horizon
}

// Adapt a generic contribution adjustment to the ScenarioEvent seam: its monthly
// dial becomes a (bounded) contribution delta, its net-worth dial a dated pool
// delta at startDate, and its expense dial a scalar FI-number bump. Any field
// left at 0/undefined emits nothing, so a pure contribution row and a pure
// down-payment row both round-trip through the same converter.
export function adjustmentToEvent(adj: ContributionAdjustment): ScenarioEvent {
  return {
    contributionDeltas: () =>
      adj.monthlyAdjustment || adj.retiringOwner
        ? [
            {
              name: adj.name,
              startDate: adj.startDate,
              monthlyAdjustment: adj.monthlyAdjustment || 0,
              retiringOwner: adj.retiringOwner,
              endDate: adj.endDate,
            },
          ]
        : [],
    netWorthDeltas: () =>
      adj.netWorthAdjustment
        ? [{ name: adj.name, date: adj.startDate, amount: adj.netWorthAdjustment }]
        : [],
    expenseDelta: () => adj.expenseAdjustment ?? 0,
    // Note: net-worth adjustments do NOT reshape the tax split here. The
    // time-stepped contribution allocator (computeTerminalTaxRatios) owns bucket
    // reshaping now, so it can drain the balance as of the withdrawal date and
    // stack multiple withdrawals in time order. Emitting a reshape here too would
    // double-count.
  };
}

// Does a net-worth withdrawal have to reach into tax-deferred savings? True when
// the amount pulled out exceeds the accessible (taxable + tax-free) buckets at
// the given pool scale, i.e. taxable and tax-free together can't cover it. Used
// to warn that a purchase would tap RRSP/401k money that is usually locked until
// retirement. Deposits (positive) and zero never touch tax-deferred.
export function netWorthTouchesTaxDeferred(
  netWorthAdjustment: number,
  poolScale: number,
  taxFreeRatio: number,
  investmentIncomeRatio: number,
): boolean {
  if (!netWorthAdjustment || netWorthAdjustment >= 0) {
    return false;
  }
  const accessible = (taxFreeRatio + investmentIncomeRatio) * poolScale;
  return -netWorthAdjustment > accessible;
}

const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;

const yearsFromNow = (date: Date, now: number): number =>
  Math.max(0, Math.floor((new Date(date).getTime() - now) / YEAR_MS));

export function toDatedReshapes(
  adjustments: ContributionAdjustment[],
  now = Date.now()
): DatedReshape[] {
  return adjustments
    .filter((a) => a.netWorthAdjustment)
    .map((a) => ({
      year: yearsFromNow(a.startDate, now),
      amount: -a.netWorthAdjustment,
    }));
}

export function toRetirements(
  adjustments: ContributionAdjustment[],
  now = Date.now()
): Retirement[] {
  return adjustments
    .filter((a) => a.retiringOwner)
    .map((a) => ({
      ownerCode: a.retiringOwner,
      year: yearsFromNow(a.startDate, now),
    }));
}

// Clone a CalculateInput for use as a scenario. The copy constructor
// (Object.assign) copies array fields by reference, so the mutable primitive
// arrays are deep-copied here to guarantee the baseline is never mutated.
export function cloneInput(base: CalculateInput): CalculateInput {
  const clone = new CalculateInput(base);
  clone.contributionAdjustments = (base.contributionAdjustments || []).map(
    (a) => ({ ...a })
  );
  clone.netWorthDeltas = (base.netWorthDeltas || []).map((d) => ({ ...d }));
  return clone;
}

// Compile a set of events onto a fresh scenario input. Pure — never mutates
// `base`.
export function applyEvents(
  base: CalculateInput,
  events: ScenarioEvent[],
  reshapeContext?: ReshapeContext
): CalculateInput {
  const result = cloneInput(base);
  let expenseBump = 0;
  const reshapes: BucketReshape[] = [];

  for (const event of events) {
    result.netWorthDeltas.push(...(event.netWorthDeltas?.() ?? []));
    result.contributionAdjustments.push(...(event.contributionDeltas?.() ?? []));
    expenseBump += event.expenseDelta?.() ?? 0;
    reshapes.push(...(event.bucketReshapes?.() ?? []));
  }

  result.annualExpenses = result.annualExpenses + expenseBump;
  applyBucketReshapes(result, reshapes, reshapeContext);
  result.roundAll();
  return result;
}

// Reshape the three terminal tax ratios. Bucket dollars are reconstructed from
// the ratios times the pool scale, the reshapes are applied in order, and the
// ratios are recomputed on the new total. With a ReshapeContext the scale is
// the retirement-horizon pool and each dated amount is grown to that horizon,
// so the withdrawal is sized against the buckets as they will actually be when
// the cash moves. Without a context it falls back to today's net worth
// (the windfall.buildScenario proxy). Either way this is a terminal-split
// approximation: it captures which bucket the money comes from and the
// direction of the FI-number shift, not a month-by-month bucket balance.
function applyBucketReshapes(
  input: CalculateInput,
  reshapes: BucketReshape[],
  ctx?: ReshapeContext
): void {
  if (reshapes.length === 0) {
    return;
  }
  const total = ctx?.terminalNetWorth ?? input.netWorth;
  const dollars: Record<ContributionTaxType, number> = {
    'tax-free': input.taxFreeRatio * total,
    'tax-deferred': input.taxDeferredRatio * total,
    taxable: input.investmentIncomeRatio * total,
  };

  for (const reshape of reshapes) {
    const amount = grownReshapeAmount(reshape, ctx);
    if (amount < 0) {
      // Deposit lands in the first (highest-priority) bucket.
      dollars[reshape.order[0]] += -amount;
      continue;
    }
    let remaining = amount;
    for (const bucket of reshape.order) {
      if (remaining <= 0) {
        break;
      }
      const take = Math.min(dollars[bucket], remaining);
      dollars[bucket] -= take;
      remaining -= take;
    }
    // Any shortfall beyond the drained buckets is dropped — you cannot withdraw
    // what is not there; the net-worth delta still reflects the full outflow.
  }

  const newTotal = dollars['tax-free'] + dollars['tax-deferred'] + dollars.taxable;
  if (newTotal > 0) {
    input.taxFreeRatio = dollars['tax-free'] / newTotal;
    input.taxDeferredRatio = dollars['tax-deferred'] / newTotal;
    input.investmentIncomeRatio = dollars.taxable / newTotal;
  }
}

// A dated amount pulled today would have compounded by the time the terminal
// buckets are measured, so grow it from its date to the horizon. Undated
// amounts, or reshaping with no context, are used as-is (today's-dollars proxy).
function grownReshapeAmount(reshape: BucketReshape, ctx?: ReshapeContext): number {
  if (!ctx || !reshape.date) {
    return reshape.amount;
  }
  const years = Math.max(
    0,
    (ctx.horizonDate.getTime() - reshape.date.getTime()) / YEAR_MS
  );
  return reshape.amount * Math.pow(1 + ctx.annualGrowthRate, years);
}
