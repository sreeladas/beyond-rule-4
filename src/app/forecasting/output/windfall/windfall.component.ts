import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';

import { CalculateInput } from '../../models/calculate-input.model';
import { Forecast } from '../../models/forecast.model';
import { ContributionAdjustment } from '../../models/contribution-adjustment.model';
import { DebtCalculatorService } from '../../../debt/services/debt-calculator.service';
import { DebtInput } from '../../../debt/models/debt-input.model';
import {
  extractMilestones,
  formatMonthYear,
  Milestone,
  ScenarioMilestones,
} from '../milestone-utility';
import {
  buildScenario,
  emptyAllocation,
  WindfallAllocation,
} from './windfall.model';

interface Scenario {
  name: string;
  alloc: WindfallAllocation;
}

interface ScenarioResult {
  milestones: ScenarioMilestones;
  refund: number;
  deltaMonths: number | null;
}

const STORAGE_KEY = 'ff-windfall-scenarios';

@Component({
  selector: 'app-windfall',
  templateUrl: 'windfall.component.html',
  styleUrls: ['windfall.component.css'],
  standalone: false,
})
export class WindfallComponent implements OnChanges {
  @Input() calculateInput: CalculateInput;
  @Input() forecast: Forecast;

  windfallAmount = 0;
  debtAdjustmentName: string | null = null;
  debtBalance = 0;
  debtRatePercent = 5;

  scenarios: Scenario[] = [];

  baselineMilestones: ScenarioMilestones | null = null;
  results: ScenarioResult[] = [];

  private initialized = false;

  constructor(private calculator: DebtCalculatorService) {}

  ngOnChanges(_changes: SimpleChanges) {
    if (!this.calculateInput) {
      this.results = [];
      return;
    }
    if (!this.initialized) {
      this.windfallAmount = Math.round(this.calculateInput.annualExpenses);
      this.loadSettings();
      if (this.scenarios.length === 0) {
        this.seedDefaultScenarios();
      }
      this.initialized = true;
    }
    this.recompute();
  }

  get adjustments(): ContributionAdjustment[] {
    return this.calculateInput?.contributionAdjustments || [];
  }

  get debtAdjustmentIndex(): number {
    return this.adjustments.findIndex((a) => a.name === this.debtAdjustmentName);
  }

  get debtConfigured(): boolean {
    return this.debtAdjustmentIndex >= 0 && this.debtBalance > 0;
  }

  allocated(s: Scenario): number {
    return s.alloc.taxFree + s.alloc.taxDeferred + s.alloc.taxable + s.alloc.debt;
  }

  addScenario() {
    this.scenarios.push({ name: 'Scenario ' + (this.scenarios.length + 1), alloc: emptyAllocation() });
    this.onInputsChange();
  }

  removeScenario(index: number) {
    this.scenarios.splice(index, 1);
    this.onInputsChange();
  }

  onInputsChange() {
    this.saveSettings();
    this.recompute();
  }

  private recompute() {
    const base = this.calculateInput;
    this.baselineMilestones = extractMilestones(this.forecast);
    const baselineFi = this.baselineMilestones.fi;

    const debtIndex = this.debtConfigured ? this.debtAdjustmentIndex : -1;
    const payment = debtIndex >= 0 ? this.adjustments[debtIndex].monthlyAdjustment : 0;

    this.results = this.scenarios.map((scenario) => {
      const monthsSaved =
        debtIndex >= 0 && scenario.alloc.debt > 0
          ? this.computeMonthsSaved(payment, scenario.alloc.debt)
          : 0;
      const built = buildScenario(base, scenario.alloc, debtIndex, monthsSaved);
      const milestones = extractMilestones(new Forecast(built.input));
      return {
        milestones,
        refund: built.refund,
        deltaMonths: this.deltaMonths(milestones.fi, baselineFi),
      };
    });
  }

  private deltaMonths(scenarioFi: Milestone, baselineFi: Milestone): number | null {
    if (!scenarioFi.date || !baselineFi.date) {
      return null;
    }
    return (
      (scenarioFi.date.getFullYear() - baselineFi.date.getFullYear()) * 12 +
      (scenarioFi.date.getMonth() - baselineFi.date.getMonth())
    );
  }

  private computeMonthsSaved(payment: number, debtPrepayment: number): number {
    if (!payment || payment <= 0) {
      return 0;
    }
    const endDate = new Date();
    endDate.setFullYear(endDate.getFullYear() + 100); // far horizon; only bounds the loop
    const debtInput: DebtInput = {
      accountId: 'windfall',
      accountName: 'debt',
      currentBalance: this.debtBalance,
      currentRate: this.debtRatePercent / 100,
      endDate,
      currentMonthlyPayment: payment,
    };
    const baseline = this.calculator.generateAmortization(debtInput);
    const accelerated = this.calculator.generateAmortization(debtInput, [
      {
        type: 'pre-payment',
        name: 'windfall',
        amount: debtPrepayment,
        frequency: 'one-time',
        startDate: new Date(),
      },
    ]);
    return Math.max(0, baseline.payoffMonths - accelerated.payoffMonths);
  }

  formatDate(date: Date | null): string {
    return formatMonthYear(date) || '—';
  }

  deltaLabel(deltaMonths: number | null | undefined): string {
    if (deltaMonths === null || deltaMonths === undefined || deltaMonths === 0) {
      return '';
    }
    const sign = deltaMonths < 0 ? '−' : '+';
    return `${sign}${Math.abs(deltaMonths)} mo`;
  }

  deltaClass(result: ScenarioResult | undefined): string {
    const delta = result?.deltaMonths;
    if (delta === null || delta === undefined || delta === 0) {
      return '';
    }
    return delta < 0 ? 'text-success' : 'text-danger';
  }

  hasRefund(result: ScenarioResult | undefined): boolean {
    return !!result && result.refund > 0;
  }

  private seedDefaultScenarios() {
    const amount = this.windfallAmount;
    this.scenarios = [
      { name: 'All tax-free', alloc: { ...emptyAllocation(), taxFree: amount } },
      { name: 'All tax-deferred', alloc: { ...emptyAllocation(), taxDeferred: amount } },
      { name: 'All debt', alloc: { ...emptyAllocation(), debt: amount } },
    ];
  }

  private loadSettings() {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return;
    }
    try {
      const parsed = JSON.parse(stored);
      if (typeof parsed.windfallAmount === 'number') {
        this.windfallAmount = parsed.windfallAmount;
      }
      this.debtAdjustmentName = parsed.debtAdjustmentName ?? null;
      this.debtBalance = parsed.debtBalance ?? 0;
      this.debtRatePercent = parsed.debtRatePercent ?? 5;
      if (Array.isArray(parsed.scenarios)) {
        this.scenarios = parsed.scenarios.map((s: Scenario) => ({
          name: s.name,
          alloc: { ...emptyAllocation(), ...s.alloc },
        }));
      }
    } catch {
      // keep defaults
    }
  }

  private saveSettings() {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        windfallAmount: this.windfallAmount,
        debtAdjustmentName: this.debtAdjustmentName,
        debtBalance: this.debtBalance,
        debtRatePercent: this.debtRatePercent,
        scenarios: this.scenarios,
      })
    );
  }
}
