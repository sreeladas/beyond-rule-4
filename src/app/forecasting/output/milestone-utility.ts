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

function firstWhere(
  forecast: Forecast,
  predicate: (f: MonthlyForecast) => boolean
): Milestone {
  const found = forecast?.monthlyForecasts?.find(predicate);
  return found ? { date: found.date, netWorth: found.netWorth } : EMPTY;
}

/**
 * Extracts the FI date + the three Coast FIRE achievement points from a built
 * forecast, each as { date, netWorth }. Mirrors the per-month flags the forecast
 * already computes (so it matches the fire-dashboard achievement dates exactly).
 * The forecast must have been built from the scenario's own CalculateInput, so
 * `fireAchieved` / `coastFireAchieved` are relative to that scenario.
 */
export function extractMilestones(forecast: Forecast): ScenarioMilestones {
  return {
    fi: firstWhere(forecast, (f) => f.fireAchieved),
    coastPlusFive: firstWhere(forecast, (f) => f.netWorth >= f.coastFirePlusFive),
    coast: firstWhere(forecast, (f) => f.coastFireAchieved),
    coastMinusFive: firstWhere(
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
