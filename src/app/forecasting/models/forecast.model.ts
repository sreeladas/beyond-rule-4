import { CalculateInput } from './calculate-input.model';
import { round } from '../utilities/number-utility';
import { Birthdate } from '../input/ynab/birthdate-utility';
import { ContributionAdjustmentUtility } from './contribution-adjustment.model';

export class Forecast {
  monthlyForecasts: MonthlyForecast[];
  month0Date: Date;
  birthdate: Birthdate;

  public constructor(calculateInput: CalculateInput, month0Date?: Date) {
    if (!calculateInput) {
      return;
    }
    if (!this.month0Date) {
      this.month0Date = new Date();
    }
    this.birthdate = calculateInput.birthdate;
    this.month0Date.setDate(1); // make it the first of the month
    this.computeForecast(calculateInput);
    this.setDates();
  }

  public getDistanceFromFirstMonthText(forecastDate: Date): string {
    const inPast = forecastDate < this.month0Date;
    const difference = this.getDistanceFromDateText(
      forecastDate,
      this.month0Date
    );
    const suffix = inPast ? 'ago' : '';
    return difference ? difference + suffix : undefined;
  }

  public getDistanceFromDateText(forecastDate: Date, fromDate: Date): string {
    if (!forecastDate || !fromDate) {
      return;
    }

    let monthDifference =
      (forecastDate.getFullYear() - fromDate.getFullYear()) * 12 +
      (forecastDate.getMonth() - fromDate.getMonth());

    if (monthDifference === 0) {
      return;
    }

    monthDifference = Math.abs(monthDifference);
    const months = monthDifference % 12;
    const years = (monthDifference - months) / 12;
    return (
      this.getTimeString(years, 'year') + this.getTimeString(months, 'month')
    );
  }

  private getTimeString(timeDifference: number, unit: string): string {
    if (timeDifference === 0) {
      return '';
    }
    if (timeDifference === 1) {
      return `1 ${unit} `;
    }
    return `${timeDifference} ${unit}s `;
  }

  private computeForecast(calculateInput: CalculateInput) {
    const stopForecastingAmount = calculateInput.fiNumber * 2; // default to a bit more than Fat FI.

    const annualExpenses = calculateInput.annualExpenses;
    const monthlyAverageGrowth =
      1 + calculateInput.expectedAnnualGrowthRate / 12;
    const startingNetWorth = calculateInput.netWorth;
    let currentNetWorth = startingNetWorth;
    let totalContributions = currentNetWorth; // can't yet delve into the past
    let month = 0;

    // Calculate initial Coast FIRE values for month 0
    const initialCoastFire = this.calculateCoastFireForMonth(calculateInput, 0);

    const monthlyForecasts = [
      new MonthlyForecast({
        monthIndex: 0,
        netWorth: startingNetWorth,
        lastMonthNetWorth: 0,
        contribution: 0,
        interestGains: 0,
        timesAnnualExpenses: round(startingNetWorth / annualExpenses),
        totalContributions: totalContributions,
        totalReturns: 0,
        coastFireNumber: initialCoastFire.coastFireNumber,
        coastFirePlusFive: initialCoastFire.coastFirePlusFive,
        coastFireMinusFive: initialCoastFire.coastFireMinusFive,
        coastFireAchieved: startingNetWorth >= initialCoastFire.coastFireNumber,
        fireAchieved: startingNetWorth >= calculateInput.fiNumber,
      }),
    ];
    while (currentNetWorth < stopForecastingAmount && month < 720) {
      month++;
      const forecastDate = new Date(this.month0Date);
      forecastDate.setMonth(this.month0Date.getMonth() + month);

      const adjustment = ContributionAdjustmentUtility.getAdjustmentForMonth(
        calculateInput.contributionAdjustments,
        forecastDate
      );
      const yearIndex = Math.floor((month - 1) / 12);
      const deflator = calculateInput.inflationDeflator(yearIndex);
      const realBase = round(
        calculateInput.monthlyContribution *
          calculateInput.contributionGrowthMultiplier(yearIndex) *
          deflator
      );
      const realAdjustment = round(adjustment * deflator);
      const contribution = realBase + realAdjustment;

      // Dated one-time principal moving in/out of the pool this month (down
      // payment out, windfall / home-sale proceeds in). Already in today's
      // dollars, so — unlike contributions — it is NOT deflated. Applied before
      // this month's growth: money withdrawn stops compounding immediately,
      // money added starts. Folded into totalContributions (it is principal,
      // not a return) so totalReturns stays coherent.
      const netWorthDelta = this.getNetWorthDeltaForMonth(
        calculateInput.netWorthDeltas,
        forecastDate
      );

      const newNetWorth = round(
        ((currentNetWorth + contribution + netWorthDelta) *
          100 *
          monthlyAverageGrowth) /
          100
      );
      const interestGain = round(
        newNetWorth - currentNetWorth - contribution - netWorthDelta
      );
      const timesAnnualExpenses = round(newNetWorth / annualExpenses);
      totalContributions += contribution + netWorthDelta;
      const totalReturns = round(newNetWorth - totalContributions);

      // Calculate dynamic Coast FIRE values for this month
      const monthCoastFire = this.calculateCoastFireForMonth(
        calculateInput,
        month
      );

      monthlyForecasts.push(
        new MonthlyForecast({
          monthIndex: month,
          netWorth: newNetWorth,
          lastMonthNetWorth: currentNetWorth,
          contribution: contribution,
          interestGains: interestGain,
          timesAnnualExpenses: timesAnnualExpenses,
          totalContributions: totalContributions,
          totalReturns: totalReturns,
          coastFireNumber: monthCoastFire.coastFireNumber,
          coastFirePlusFive: monthCoastFire.coastFirePlusFive,
          coastFireMinusFive: monthCoastFire.coastFireMinusFive,
          coastFireAchieved: newNetWorth >= monthCoastFire.coastFireNumber,
          fireAchieved: newNetWorth >= calculateInput.fiNumber,
        })
      );
      currentNetWorth = newNetWorth;
    }
    this.monthlyForecasts = monthlyForecasts;
  }

  // Sum of dated net-worth deltas landing in the same calendar month as
  // forecastDate (which is always the 1st of the month). A delta whose date
  // falls outside the forecast horizon — e.g. in the past — matches no month
  // and is silently ignored.
  private getNetWorthDeltaForMonth(
    deltas: { date: Date; amount: number }[],
    forecastDate: Date
  ): number {
    if (!deltas || deltas.length === 0) {
      return 0;
    }
    let total = 0;
    for (const delta of deltas) {
      const date = new Date(delta.date);
      if (
        date.getFullYear() === forecastDate.getFullYear() &&
        date.getMonth() === forecastDate.getMonth()
      ) {
        total += delta.amount;
      }
    }
    return round(total);
  }

  private calculateCoastFireForMonth(
    calculateInput: CalculateInput,
    monthIndex: number
  ): {
    coastFireNumber: number;
    coastFirePlusFive: number;
    coastFireMinusFive: number;
  } {
    const currentAge = calculateInput.currentAge;
    if (currentAge === 0) {
      return {
        coastFireNumber: calculateInput.fiNumber,
        coastFirePlusFive: calculateInput.fiNumber,
        coastFireMinusFive: calculateInput.fiNumber,
      };
    }

    // Calculate age at this month (accounting for months passed)
    const ageAtThisMonth = currentAge + monthIndex / 12;

    // Standard retirement age
    const yearsToRetirement = calculateInput.retirementAge - ageAtThisMonth;
    let coastFireNumber = calculateInput.fiNumber;
    if (yearsToRetirement > 0) {
      coastFireNumber =
        calculateInput.fiNumber /
        Math.pow(
          1 + calculateInput.expectedAnnualGrowthRate,
          yearsToRetirement
        );
    }

    // Retirement age + 5 years
    const yearsToRetirementPlusFive =
      calculateInput.retirementAge + 5 - ageAtThisMonth;
    let coastFirePlusFive = calculateInput.fiNumber;
    if (yearsToRetirementPlusFive > 0) {
      coastFirePlusFive =
        calculateInput.fiNumber /
        Math.pow(
          1 + calculateInput.expectedAnnualGrowthRate,
          yearsToRetirementPlusFive
        );
    }

    // Retirement age - 5 years
    const yearsToRetirementMinusFive =
      calculateInput.retirementAge - 5 - ageAtThisMonth;
    let coastFireMinusFive = calculateInput.fiNumber;
    if (yearsToRetirementMinusFive > 0) {
      coastFireMinusFive =
        calculateInput.fiNumber /
        Math.pow(
          1 + calculateInput.expectedAnnualGrowthRate,
          yearsToRetirementMinusFive
        );
    }

    return {
      coastFireNumber: round(coastFireNumber),
      coastFirePlusFive: round(coastFirePlusFive),
      coastFireMinusFive: round(coastFireMinusFive),
    };
  }

  private setDates() {
    const firstMonth = this.month0Date.getMonth();
    this.monthlyForecasts.forEach((monthlyForecast) => {
      const forecastDate = new Date(this.month0Date);
      forecastDate.setMonth(firstMonth + monthlyForecast.monthIndex);
      monthlyForecast.date = forecastDate;
    });
  }
}

export class MonthlyForecast {
  monthIndex: number;
  date: Date;
  age: Date;
  netWorth: number;
  lastMonthNetWorth: number;
  contribution: number;
  interestGains: number;
  timesAnnualExpenses: number;
  totalContributions: number;
  totalReturns: number;
  coastFireNumber: number;
  coastFirePlusFive: number;
  coastFireMinusFive: number;
  coastFireAchieved: boolean;
  fireAchieved: boolean;

  public constructor(init?: Partial<MonthlyForecast>) {
    Object.assign(this, init);
  }

  public toDateString() {
    return this.date.toLocaleString('en-us', {
      month: 'long',
      year: 'numeric',
    });
  }
}
