import { CalculateInput } from '../models/calculate-input.model';
import { Forecast, MonthlyForecast } from '../models/forecast.model';
import { cloneInput } from '../models/scenario-event';

export interface Milestone {
  date: Date | null;
  netWorth: number | null;
}

export interface ScenarioMilestones {
  fi: Milestone;
  coastPlusFive: Milestone;
  coast: Milestone;
  coastMinusFive: Milestone;
}

const EMPTY: Milestone = { date: null, netWorth: null };

// The DURABLE achievement point: the first month from which `predicate` holds
// for every remaining month of the forecast, i.e. the start of the final
// uninterrupted run. A plain "first month it's ever true" is wrong for scenarios
// that move principal out later — a house down payment (or the reduced
// contributions that follow it) can push net worth back below the FI number
// after an earlier crossing, and that earlier crossing is not real independence.
// Walking backwards from the horizon finds the crossing that actually sticks.
// For a monotonic baseline (no withdrawals) the final run starts at the first
// crossing, so this is identical to the old behavior; it only diverges when a
// later event reverses a crossing — exactly the case the old code masked.
export function lastSustained(
  forecast: Forecast,
  predicate: (f: MonthlyForecast) => boolean
): MonthlyForecast | undefined {
  const months = forecast?.monthlyForecasts;
  if (!months || months.length === 0) {
    return undefined;
  }
  let result: MonthlyForecast | undefined;
  for (let i = months.length - 1; i >= 0; i--) {
    if (!predicate(months[i])) {
      break;
    }
    result = months[i];
  }
  return result;
}

function sustainedMilestone(
  forecast: Forecast,
  predicate: (f: MonthlyForecast) => boolean
): Milestone {
  const found = lastSustained(forecast, predicate);
  return found ? { date: found.date, netWorth: found.netWorth } : EMPTY;
}

/**
 * Extracts the FI date + the three Coast FIRE achievement points from a built
 * forecast, each as { date, netWorth }. Mirrors the per-month flags the forecast
 * already computes (so it matches the fire-dashboard achievement dates exactly).
 * The forecast must have been built from the scenario's own CalculateInput, so
 * `fireAchieved` / `coastFireAchieved` are relative to that scenario.
 *
 * Each milestone is the DURABLE crossing (see `lastSustained`): a scenario that
 * withdraws principal later — e.g. a house purchase — must not report a milestone
 * date that a subsequent outflow undoes.
 */
export function extractMilestones(forecast: Forecast): ScenarioMilestones {
  return {
    fi: sustainedMilestone(forecast, (f) => f.fireAchieved),
    coastPlusFive: sustainedMilestone(
      forecast,
      (f) => f.netWorth >= f.coastFirePlusFive
    ),
    coast: sustainedMilestone(forecast, (f) => f.coastFireAchieved),
    coastMinusFive: sustainedMilestone(
      forecast,
      (f) => f.netWorth >= f.coastFireMinusFive
    ),
  };
}

// Bisection over the real forecast, so contribution growth, inflation erosion,
// dated adjustments and net-worth events are all honored. null = unreachable.
export function requiredMonthlyContribution(
  input: CalculateInput,
  milestone: keyof ScenarioMilestones,
  targetDate: Date
): number | null {
  const meetsTarget = (monthlyContribution: number): boolean => {
    const scenario = cloneInput(input);
    scenario.monthlyContribution = monthlyContribution;
    const date = extractMilestones(new Forecast(scenario))[milestone].date;
    return !!date && date <= targetDate;
  };

  if (meetsTarget(0)) {
    return 0;
  }
  let low = 0;
  let high = input.fiNumber / 12;
  if (!meetsTarget(high)) {
    return null;
  }
  while (high - low > 1) {
    const mid = (low + high) / 2;
    if (meetsTarget(mid)) {
      high = mid;
    } else {
      low = mid;
    }
  }
  return Math.ceil(high);
}

export function formatMonthYear(date: Date | null): string | null {
  if (!date) {
    return null;
  }
  return date.toLocaleString('en-us', { month: 'long', year: 'numeric' });
}
