import { Birthdate } from '../input/ynab/birthdate-utility';
import { round } from '../utilities/number-utility';
import { ContributionAdjustment } from './contribution-adjustment.model';

export class CalculateInput {
  netWorth = 0;
  annualExpenses = 0;
  leanAnnualExpenses = 0;
  annualSafeWithdrawalRate = 0;
  expectedAnnualGrowthRate = 0;
  monthlyContribution = 0;
  leanFiPercentage = 0;
  budgetCategoryGroups = [];
  currencyIsoCode = 'CAD';
  monthFromName = '';
  monthToName = '';
  birthdate: Birthdate = null;
  retirementAge = 60;
  contributionAdjustments: ContributionAdjustment[] = [];
  isUsingSampleData = false;

  taxFreeRatio = 0.4;
  taxDeferredRatio = 0.4;
  investmentIncomeRatio = 0.2;
  taxDeferredRateMin = 0.3;
  taxDeferredRateMax = 0.5;
  investmentIncomeRateMin = 0.15;
  investmentIncomeRateMax = 0.25;

  public constructor(init?: Partial<CalculateInput>) {
    Object.assign(
      this,
      {
        annualSafeWithdrawalRate: 0.04,
        leanFiPercentage: 0.7,
        expectedAnnualGrowthRate: 0.07,
      },
      init,
    );
    this.roundAll();
  }

  public roundAll() {
    this.netWorth = round(this.netWorth);
    this.annualExpenses = round(this.annualExpenses);
    this.annualSafeWithdrawalRate = round(this.annualSafeWithdrawalRate, 4);
    this.expectedAnnualGrowthRate = round(this.expectedAnnualGrowthRate, 4);
    this.monthlyContribution = round(this.monthlyContribution);
    this.leanFiPercentage = round(this.leanFiPercentage);
    this.leanAnnualExpenses = round(this.leanAnnualExpenses);
    this.retirementAge = Math.round(this.retirementAge);
    this.taxFreeRatio = round(this.taxFreeRatio, 2);
    this.taxDeferredRatio = round(this.taxDeferredRatio, 2);
    this.investmentIncomeRatio = round(this.investmentIncomeRatio, 2);
    this.taxDeferredRateMin = round(this.taxDeferredRateMin, 4);
    this.taxDeferredRateMax = round(this.taxDeferredRateMax, 4);
    this.investmentIncomeRateMin = round(this.investmentIncomeRateMin, 4);
    this.investmentIncomeRateMax = round(this.investmentIncomeRateMax, 4);
  }

  get safeWithdrawalTimes() {
    return 1 / this.annualSafeWithdrawalRate;
  }

  get taxMinMultiplier(): number {
    const blendedTaxRate =
      this.taxFreeRatio * 0 +
      this.taxDeferredRatio * this.taxDeferredRateMin +
      this.investmentIncomeRatio * this.investmentIncomeRateMin;
    return 1 / (1 - blendedTaxRate);
  }

  get taxMaxMultiplier(): number {
    const blendedTaxRate =
      this.taxFreeRatio * 0 +
      this.taxDeferredRatio * this.taxDeferredRateMax +
      this.investmentIncomeRatio * this.investmentIncomeRateMax;
    return 1 / (1 - blendedTaxRate);
  }

  get fiNumber() {
    const avgTaxMultiplier =
      (this.taxMinMultiplier + this.taxMaxMultiplier) / 2;
    return this.safeWithdrawalTimes * this.annualExpenses * avgTaxMultiplier;
  }

  get leanFiNumber() {
    let leanFiNumber = this.fiNumber * this.leanFiPercentage;
    if (this.leanAnnualExpenses) {
      const avgTaxMultiplier =
        (this.taxMinMultiplier + this.taxMaxMultiplier) / 2;
      leanFiNumber =
        this.safeWithdrawalTimes * this.leanAnnualExpenses * avgTaxMultiplier;
    }
    return leanFiNumber;
  }

  get currentAge(): number {
    if (!this.birthdate || !this.birthdate.year) {
      return 0;
    }
    const currentYear = new Date().getFullYear();
    return currentYear - this.birthdate.year;
  }

  get coastFireNumber(): number {
    const currentAge = this.currentAge;
    if (currentAge === 0 || this.retirementAge <= currentAge) {
      return this.fiNumber;
    }
    const yearsToRetirement = this.retirementAge - currentAge;
    const futureValue =
      this.fiNumber /
      Math.pow(1 + this.expectedAnnualGrowthRate, yearsToRetirement);
    return round(futureValue);
  }

  get coastFirePlusFive(): number {
    const currentAge = this.currentAge;
    if (currentAge === 0) {
      return this.fiNumber;
    }
    const yearsToRetirement = this.retirementAge + 5 - currentAge;
    if (yearsToRetirement <= 0) {
      return this.fiNumber;
    }
    const futureValue =
      this.fiNumber /
      Math.pow(1 + this.expectedAnnualGrowthRate, yearsToRetirement);
    return round(futureValue);
  }

  get coastFireMinusFive(): number {
    const currentAge = this.currentAge;
    if (currentAge === 0) {
      return this.fiNumber;
    }
    const yearsToRetirement = this.retirementAge - 5 - currentAge;
    if (yearsToRetirement <= 0) {
      return this.fiNumber;
    }
    const futureValue =
      this.fiNumber /
      Math.pow(1 + this.expectedAnnualGrowthRate, yearsToRetirement);
    return round(futureValue);
  }

  get coastYearsMin(): number {
    const targetAmount =
      this.annualExpenses * this.taxMinMultiplier * this.safeWithdrawalTimes;
    if (this.netWorth >= targetAmount) return 0;
    return (
      Math.log(targetAmount / this.netWorth) /
      Math.log((100 + this.expectedAnnualGrowthRate * 100) / 100)
    );
  }

  get coastYearsMax(): number {
    const targetAmount =
      this.annualExpenses * this.taxMaxMultiplier * this.safeWithdrawalTimes;
    if (this.netWorth >= targetAmount) return 0;
    return (
      Math.log(targetAmount / this.netWorth) /
      Math.log((100 + this.expectedAnnualGrowthRate * 100) / 100)
    );
  }

  get coastYearsRange(): string {
    const min = Math.round(this.coastYearsMin);
    const max = Math.round(this.coastYearsMax);
    return min === max ? `${min}` : `${min} - ${max}`;
  }
}
