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
  }

  get safeWithdrawalTimes() {
    return 1 / this.annualSafeWithdrawalRate;
  }

  get fiNumber() {
    return this.safeWithdrawalTimes * this.annualExpenses;
  }

  get leanFiNumber() {
    let leanFiNumber = this.fiNumber * this.leanFiPercentage;
    if (this.leanAnnualExpenses) {
      leanFiNumber = this.safeWithdrawalTimes * this.leanAnnualExpenses;
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
}
