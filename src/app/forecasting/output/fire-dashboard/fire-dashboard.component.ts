import {
  Component,
  OnInit,
  Input,
  OnChanges,
  SimpleChanges,
} from '@angular/core';

import { CalculateInput } from '../../models/calculate-input.model';
import { Forecast } from '../../models/forecast.model';

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

  constructor() {}

  ngOnInit() {}

  ngOnChanges(changes: SimpleChanges) {
    if (changes && this.calculateInput && this.forecast) {
      this.calculateAchievementDates();
    }
  }

  private calculateAchievementDates() {
    if (!this.forecast || !this.forecast.monthlyForecasts) {
      return;
    }

    // Find achievement dates
    const fireAchieved = this.forecast.monthlyForecasts.find(
      (f) => f.fireAchieved
    );
    const coastFireAchieved = this.forecast.monthlyForecasts.find(
      (f) => f.coastFireAchieved
    );
    const coastFireMinusFiveAchieved = this.forecast.monthlyForecasts.find(
      (f) => f.netWorth >= f.coastFireMinusFive
    );
    const coastFirePlusFiveAchieved = this.forecast.monthlyForecasts.find(
      (f) => f.netWorth >= f.coastFirePlusFive
    );

    this.fireAchievedDate = fireAchieved ? fireAchieved.toDateString() : null;
    this.coastFireAchievedDate = coastFireAchieved
      ? coastFireAchieved.toDateString()
      : null;
    this.coastFireMinusFiveAchievedDate = coastFireMinusFiveAchieved
      ? coastFireMinusFiveAchieved.toDateString()
      : null;
    this.coastFirePlusFiveAchievedDate = coastFirePlusFiveAchieved
      ? coastFirePlusFiveAchieved.toDateString()
      : null;
  }

  formatCurrency(amount: number): string {
    if (amount >= 1_000_000) {
      return `$${(amount / 1_000_000).toFixed(2)}M`;
    } else if (amount >= 1_000) {
      return `$${(amount / 1_000).toFixed(1)}k`;
    } else {
      return `$${amount.toLocaleString()}`;
    }
  }

  get blendedTaxRate(): number {
    if (!this.calculateInput) return 0;
    const avgRate =
      this.calculateInput.taxFreeRatio * 0 +
      (this.calculateInput.taxDeferredRatio *
        (this.calculateInput.taxDeferredRateMin +
          this.calculateInput.taxDeferredRateMax)) /
        2 +
      (this.calculateInput.investmentIncomeRatio *
        (this.calculateInput.investmentIncomeRateMin +
          this.calculateInput.investmentIncomeRateMax)) /
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
}
