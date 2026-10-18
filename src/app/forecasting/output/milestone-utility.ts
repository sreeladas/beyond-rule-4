import { Forecast, MonthlyForecast } from '../models/forecast.model';

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
function lastSustained(
  forecast: Forecast,
  predicate: (f: MonthlyForecast) => boolean
): Milestone {
  const months = forecast?.monthlyForecasts;
  if (!months || months.length === 0) {
    return EMPTY;
  }
  let result = EMPTY;
  for (let i = months.length - 1; i >= 0; i--) {
    if (!predicate(months[i])) {
      break;
    }
    result = { date: months[i].date, netWorth: months[i].netWorth };
  }
  return result;
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
    fi: lastSustained(forecast, (f) => f.fireAchieved),
    coastPlusFive: lastSustained(
      forecast,
      (f) => f.netWorth >= f.coastFirePlusFive
    ),
    coast: lastSustained(forecast, (f) => f.coastFireAchieved),
    coastMinusFive: lastSustained(
      forecast,
      (f) => f.netWorth >= f.coastFireMinusFive
    ),
  };
}

export function formatMonthYear(date: Date | null): string | null {
  if (!date) {
    return null;
  }
  return date.toLocaleString('en-us', { month: 'long', year: 'numeric' });
}
