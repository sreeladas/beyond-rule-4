import {
  Component,
  OnInit,
  Input,
  OnChanges,
  SimpleChanges,
} from '@angular/core';

import { CalculateInput } from '../../models/calculate-input.model';
import { Forecast } from '../../models/forecast.model';
import { birthdateToDate } from '../../input/ynab/birthdate-utility';
import {
  extractMilestones,
  formatMonthYear,
  requiredMonthlyContribution,
} from '../milestone-utility';

@Component({
  selector: 'app-fire-dashboard',
  templateUrl: './fire-dashboard.component.html',
  styleUrls: ['./fire-dashboard.component.css'],
  standalone: false,
})
export class FireDashboardComponent implements OnInit, OnChanges {
  @Input() calculateInput: CalculateInput;
  @Input() forecast: Forecast;

  fireAchievedDate: string;
  coastFireAchievedDate: string;
  coastFireMinusFiveAchievedDate: string;
  coastFirePlusFiveAchievedDate: string;
  minMonthlyContribution: number | null = null;

  constructor() {}

  ngOnInit() {}

  ngOnChanges(changes: SimpleChanges) {
    if (changes && this.calculateInput && this.forecast) {
      this.calculateAchievementDates();
      this.minMonthlyContribution = this.calculateMinMonthlyContribution();
    }
  }

  private calculateAchievementDates() {
    if (!this.forecast || !this.forecast.monthlyForecasts) {
      return;
    }

    const milestones = extractMilestones(this.forecast);
    this.fireAchievedDate = formatMonthYear(milestones.fi.date);
    this.coastFireAchievedDate = formatMonthYear(milestones.coast.date);
    this.coastFireMinusFiveAchievedDate = formatMonthYear(
      milestones.coastMinusFive.date
    );
    this.coastFirePlusFiveAchievedDate = formatMonthYear(
      milestones.coastPlusFive.date
    );
  }

  formatCurrency(amount: number): string {
    const symbol = this.currencySymbol;
    if (amount >= 1_000_000) {
      return `${symbol}${(amount / 1_000_000).toFixed(2)}M`;
    } else if (amount >= 1_000) {
      return `${symbol}${(amount / 1_000).toFixed(1)}k`;
    } else {
      return `${symbol}${amount.toLocaleString()}`;
    }
  }

  private get currencySymbol(): string {
    try {
      return (0).toLocaleString(undefined, {
        style: 'currency',
        currency: this.calculateInput?.currencyIsoCode || 'CAD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).replace(/\d/g, '').trim();
    } catch {
      return '$';
    }
  }

  get blendedTaxRate(): number {
    if (!this.calculateInput) return 0;
    const avgRate =
      this.calculateInput.taxFreeRatio * 0 +
      (this.calculateInput.taxDeferredRatio *
        (this.calculateInput.taxDeferredWithdrawalRateMin +
          this.calculateInput.taxDeferredWithdrawalRateMax)) /
        2 +
      (this.calculateInput.investmentIncomeRatio *
        (this.calculateInput.investmentIncomeRateMin +
          this.calculateInput.investmentIncomeRateMax) *
        this.calculateInput.taxableGainFraction) /
        2;
    return avgRate * 100;
  }

  get taxFreePercentage(): number {
    return this.calculateInput ? this.calculateInput.taxFreeRatio * 100 : 0;
  }

  get taxDeferredPercentage(): number {
    return this.calculateInput ? this.calculateInput.taxDeferredRatio * 100 : 0;
  }

  get taxablePercentage(): number {
    return this.calculateInput
      ? this.calculateInput.investmentIncomeRatio * 100
      : 0;
  }

  progressPercent(target: number): number {
    if (!this.calculateInput || !target || target <= 0) return 0;
    return Math.min(100, (this.calculateInput.netWorth / target) * 100);
  }

  private calculateMinMonthlyContribution(): number | null {
    const input = this.calculateInput;
    if (input.currentAge === 0 || input.retirementAge <= input.currentAge) {
      return null;
    }
    const retirementDate = birthdateToDate(input.birthdate);
    retirementDate.setFullYear(retirementDate.getFullYear() + input.retirementAge);
    return requiredMonthlyContribution(input, 'fi', retirementDate);
  }
}
