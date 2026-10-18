import { Component, Input, OnChanges } from '@angular/core';

import { CalculateInput } from '../../models/calculate-input.model';
import { Forecast } from '../../models/forecast.model';
import { ContributionAdjustment } from '../../models/contribution-adjustment.model';
import { adjustmentToEvent, applyEvents } from '../../models/scenario-event';
import {
  computeTerminalTaxRatios,
  DatedReshape,
} from '../../models/contribution-allocator';
import {
  extractMilestones,
  formatMonthYear,
  Milestone,
  ScenarioMilestones,
} from '../milestone-utility';

// Same key the ynab input panel persists adjustments under — this card reads the
// live list and reacts to the "Compare" flag the user sets there.
const STORAGE_KEY = 'ff-contribution-adjustments';

// Shows the effect of the adjustments the user has flagged "Compare". The
// baseline is the enabled world (already baked into `calculateInput` / the
// `forecast` @Input by the ynab panel); the scenario re-runs that baseline with
// every compare row folded on top. So: none-of-compare vs all-of-compare.
@Component({
  selector: 'app-scenario-comparison',
  templateUrl: 'scenario-comparison.component.html',
  standalone: false,
})
export class ScenarioComparisonComponent implements OnChanges {
  @Input() calculateInput: CalculateInput;
  @Input() forecast: Forecast;

  baselineMilestones: ScenarioMilestones | null = null;
  scenarioMilestones: ScenarioMilestones | null = null;
  compareNames: string[] = [];
  deltaMonths: number | null = null;
  // False when the compare scenario never durably reaches FI: net worth is below
  // the FI number at the horizon, OR only crosses it in the final simulated month
  // (the cutoff), so there is no real sustained run. Drives the "Never sustained"
  // label instead of showing the horizon-edge date as if it were an FI date.
  scenarioFiSustained = false;

  ngOnChanges() {
    if (!this.calculateInput || !this.forecast) {
      this.scenarioMilestones = null;
      this.baselineMilestones = null;
      return;
    }
    this.recompute();
  }

  formatDate(date: Date | null): string {
    return formatMonthYear(date) || '—';
  }

  deltaLabel(): string {
    if (this.deltaMonths === null || this.deltaMonths === 0) {
      return '';
    }
    const sign = this.deltaMonths < 0 ? '−' : '+';
    return `${sign}${Math.abs(this.deltaMonths)} mo`;
  }

  get deltaClass(): string {
    if (this.deltaMonths === null || this.deltaMonths === 0) {
      return '';
    }
    // A later FI date (positive) is the cost of the compared events; an earlier
    // date (a downsize / windfall) is a win.
    return this.deltaMonths < 0 ? 'text-success' : 'text-danger';
  }

  private recompute() {
    this.baselineMilestones = extractMilestones(this.forecast);

    const compare = this.loadCompareAdjustments();
    this.compareNames = compare.map((a) => a.name || 'Untitled adjustment');

    if (compare.length === 0) {
      this.scenarioMilestones = null;
      this.deltaMonths = null;
      this.scenarioFiSustained = false;
      return;
    }

    const scenarioInput = applyEvents(
      this.calculateInput,
      compare.map(adjustmentToEvent)
    );

    // Re-run the time-stepped tax-split projection with the compare-flagged
    // withdrawals STACKED on top of the enabled ones already baked into the
    // baseline. Each drains as of its own date; order is by date inside the
    // allocator. Falls back to the baseline ratios when there's no projection
    // (the static-ratio path, where dated reshaping isn't modeled).
    const projection = this.calculateInput.taxProjection;
    if (projection) {
      const ratios = computeTerminalTaxRatios({
        ...projection,
        reshapes: [
          ...(projection.reshapes ?? []),
          ...this.toDatedReshapes(compare),
        ],
      });
      if (ratios) {
        scenarioInput.taxFreeRatio = ratios.taxFreeRatio;
        scenarioInput.taxDeferredRatio = ratios.taxDeferredRatio;
        scenarioInput.investmentIncomeRatio = ratios.investmentIncomeRatio;
        scenarioInput.roundAll();
      }
    }

    const scenarioForecast = new Forecast(scenarioInput);
    this.scenarioMilestones = extractMilestones(scenarioForecast);
    this.scenarioFiSustained = this.isSustained(
      this.scenarioMilestones.fi,
      scenarioForecast
    );
    // A delta is only meaningful against a real FI date; suppress it when the
    // scenario never sustains FI (the label carries the message instead).
    this.deltaMonths = this.scenarioFiSustained
      ? this.diffMonths(this.scenarioMilestones.fi, this.baselineMilestones.fi)
      : null;
  }

  // A durable FI date is only real if net worth stays at/above the FI number for
  // a genuine run. The forecast keeps stepping until 2x FI, so a real crossing
  // always lands strictly BEFORE the final simulated month. When the "sustained"
  // date is null, or equals that last (cutoff / 720-month) month, FI was only
  // touched at the horizon edge — never actually sustained.
  private isSustained(fi: Milestone, forecast: Forecast): boolean {
    if (!fi.date) {
      return false;
    }
    const months = forecast.monthlyForecasts;
    const last = months?.[months.length - 1];
    return !last?.date || fi.date.getTime() < last.date.getTime();
  }

  private loadCompareAdjustments(): ContributionAdjustment[] {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return [];
    }
    try {
      const parsed = JSON.parse(stored);
      return parsed
        .filter((a) => a.state === 'compare')
        .map((a) => ({
          name: a.name,
          startDate: this.parseDate(a.startDate),
          endDate: a.endDate ? this.parseDate(a.endDate) : undefined,
          monthlyAdjustment: a.monthlyAdjustment || 0,
          expenseAdjustment: a.expenseAdjustment || 0,
          netWorthAdjustment: a.netWorthAdjustment || 0,
          state: 'compare' as const,
        }));
    } catch {
      return [];
    }
  }

  private parseDate(value: string | Date): Date {
    return typeof value === 'string' ? new Date(value) : value;
  }

  // Net-worth adjustments -> dated reshapes: whole years from now to each start
  // date, amount signed so a withdrawal drains and a windfall deposits. Mirrors
  // the ynab panel so baseline and scenario use the same timing convention.
  private toDatedReshapes(adjustments: ContributionAdjustment[]): DatedReshape[] {
    const now = Date.now();
    const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;
    return adjustments
      .filter((a) => a.netWorthAdjustment)
      .map((a) => ({
        year: Math.max(
          0,
          Math.floor((this.parseDate(a.startDate).getTime() - now) / YEAR_MS)
        ),
        amount: -a.netWorthAdjustment,
      }));
  }

  private diffMonths(scenario: Milestone, baseline: Milestone): number | null {
    if (!scenario.date || !baseline.date) {
      return null;
    }
    return (
      (scenario.date.getFullYear() - baseline.date.getFullYear()) * 12 +
      (scenario.date.getMonth() - baseline.date.getMonth())
    );
  }
}
