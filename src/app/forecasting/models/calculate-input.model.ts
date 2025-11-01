import { Birthdate } from '../input/ynab/birthdate-utility';
import { round } from '../utilities/number-utility';

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
  taxMinMultiplier: number = 1.3; // 30% tax rate adjustment
  taxMaxMultiplier: number = 1.5; // 50% tax rate adjustment

  public constructor(init?: Partial<CalculateInput>) {
    Object.assign(
      this,
      {
        annualSafeWithdrawalRate: 0.04,
        leanFiPercentage: 0.7,
        expectedAnnualGrowthRate: 0.07,
      },
      init
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
    this.taxMinMultiplier = round(this.taxMinMultiplier, 2);
    this.taxMaxMultiplier = round(this.taxMaxMultiplier, 2);
  }

  get safeWithdrawalTimes() {
    return 1 / this.annualSafeWithdrawalRate;
  }

  get fiNumber() {
    // adjusted for a 45% estimated avg tax rate
    return this.safeWithdrawalTimes * this.annualExpenses * 1.45;
  }

  get leanFiNumber() {
    let leanFiNumber = this.fiNumber * this.leanFiPercentage;
    if (this.leanAnnualExpenses) {
      // adjusted for a 45% estimated avg tax rate
      leanFiNumber = this.safeWithdrawalTimes * this.leanAnnualExpenses * 1.45;
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
