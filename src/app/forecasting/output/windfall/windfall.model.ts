import { CalculateInput } from '../../models/calculate-input.model';

export interface WindfallAllocation {
  taxFree: number;
  taxDeferred: number;
  taxable: number;
  debt: number;
}

interface ScenarioBuildResult {
  input: CalculateInput;
  refund: number;
}

export function emptyAllocation(): WindfallAllocation {
  return { taxFree: 0, taxDeferred: 0, taxable: 0, debt: 0 };
}

/**
 * Clone a CalculateInput for use as a scenario. The CalculateInput copy
 * constructor (Object.assign) copies contributionAdjustments by reference, so
 * we deep-copy that array here to guarantee the baseline is never mutated.
 */
function cloneInput(base: CalculateInput): CalculateInput {
  const clone = new CalculateInput(base);
  clone.contributionAdjustments = (base.contributionAdjustments || []).map(
    (a) => ({ ...a })
  );
  return clone;
}

/**
 * Build a scenario CalculateInput from a windfall allocation.
 *
 * - Invested portions (tax-free / tax-deferred / taxable) are added to net worth
 *   and the tax-bucket ratios are recomputed (bucket$ ≈ ratio × netWorth).
 * - A tax-deferred (RRSP) contribution also generates a refund
 *   (≈ marginal rate × contribution, using the tax-deferred rate range as the
 *   marginal proxy) which is reinvested into the tax-free bucket.
 * - The debt portion does not touch net worth; instead the contribution
 *   adjustment that represents the debt's freed payment is shifted earlier by
 *   `debtMonthsSaved` (computed by the caller via DebtCalculatorService).
 */
export function buildScenario(
  base: CalculateInput,
  alloc: WindfallAllocation,
  debtAdjustmentIndex: number,
  debtMonthsSaved: number
): ScenarioBuildResult {
  const scenario = cloneInput(base);

  const avgTaxDeferredRate =
    (base.taxDeferredRateMin + base.taxDeferredRateMax) / 2;
  const refund = (alloc.taxDeferred || 0) * avgTaxDeferredRate;

  const total = base.netWorth;
  const taxFreeDollars =
    base.taxFreeRatio * total + (alloc.taxFree || 0) + refund;
  const taxDeferredDollars =
    base.taxDeferredRatio * total + (alloc.taxDeferred || 0);
  const taxableDollars =
    base.investmentIncomeRatio * total + (alloc.taxable || 0);

  const newTotal =
    total +
    (alloc.taxFree || 0) +
    (alloc.taxDeferred || 0) +
    (alloc.taxable || 0) +
    refund;

  if (newTotal > 0) {
    scenario.taxFreeRatio = taxFreeDollars / newTotal;
    scenario.taxDeferredRatio = taxDeferredDollars / newTotal;
    scenario.investmentIncomeRatio = taxableDollars / newTotal;
  }
  scenario.netWorth = newTotal;

  if (debtAdjustmentIndex >= 0 && debtMonthsSaved > 0) {
    const adjustment = scenario.contributionAdjustments[debtAdjustmentIndex];
    if (adjustment) {
      const shifted = new Date(adjustment.startDate);
      shifted.setMonth(shifted.getMonth() - debtMonthsSaved);
      adjustment.startDate = shifted;
    }
  }

  scenario.roundAll();
  return { input: scenario, refund };
}
