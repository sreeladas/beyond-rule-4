import { CalculateInput } from '../models/calculate-input.model';
import { Forecast } from '../models/forecast.model';
import { cloneInput } from '../models/scenario-event';
import {
  extractMilestones,
  requiredMonthlyContribution,
} from './milestone-utility';

const baseInput = (overrides: Partial<CalculateInput> = {}): CalculateInput =>
  new CalculateInput({
    netWorth: 100000,
    annualExpenses: 40000,
    monthlyContribution: 0,
    expectedAnnualGrowthRate: 0.07,
    inflationRate: 0,
    ...overrides,
  });

const yearsFromNow = (years: number): Date => {
  const date = new Date();
  date.setFullYear(date.getFullYear() + years);
  return date;
};

const fiDateWith = (input: CalculateInput, monthly: number): Date | null => {
  const scenario = cloneInput(input);
  scenario.monthlyContribution = monthly;
  return extractMilestones(new Forecast(scenario)).fi.date;
};

describe('Forecast growth', () => {
  it('compounds monthly to exactly the annual rate over 12 months', () => {
    const forecast = new Forecast(baseInput());
    expect(forecast.monthlyForecasts[12].netWorth).toBeCloseTo(107000, -1);
  });

  it('keeps simulating past 2x the FI number until the last dated event', () => {
    const input = baseInput();
    input.netWorth = input.fiNumber * 3;
    const withdrawalDate = yearsFromNow(3);
    input.netWorthDeltas = [
      { date: withdrawalDate, amount: -input.fiNumber * 3.5 },
    ];

    const fi = extractMilestones(new Forecast(input)).fi.date;

    expect(fi).not.toBeNull();
    expect(fi.getTime()).toBeGreaterThan(withdrawalDate.getTime());
  });
});

describe('Retirements', () => {
  it('saves payroll plus take-home minus costs, then withdraws costs grossed up for tax', () => {
    const input = baseInput({ monthlyContribution: 4000, annualExpenses: 60000 });
    input.householdMembers = [
      { ownerCode: 'A', monthlyContribution: 2000, payrollContribution: 0, takeHome: 6000 },
      { ownerCode: 'B', monthlyContribution: 2000, payrollContribution: 500, takeHome: 7000 },
    ];
    input.contributionAdjustments = [
      { name: 'A retires', startDate: yearsFromNow(5), monthlyAdjustment: 0, retiringOwner: 'A' },
      { name: 'B retires', startDate: yearsFromNow(10), monthlyAdjustment: 0, retiringOwner: 'B' },
    ];

    const months = new Forecast(input).monthlyForecasts;

    expect(months[12].contribution).toBe(4000);
    expect(months[12 * 7].contribution).toBe(2500);
    expect(months[12 * 11].contribution).toBeCloseTo(
      -5000 * input.avgTaxMultiplier,
      0
    );
  });
});

describe('Retirement shortfall', () => {
  it('redirects pre-tax payroll net of tax before withdrawing', () => {
    const input = baseInput({ monthlyContribution: 4000, annualExpenses: 7200 * 12 });
    input.householdMembers = [
      { ownerCode: 'A', monthlyContribution: 2000, payrollContribution: 0, takeHome: 6000 },
      { ownerCode: 'B', monthlyContribution: 2000, payrollContribution: 500, takeHome: 7000 },
    ];
    input.contributionAdjustments = [
      { name: 'A retires', startDate: yearsFromNow(1), monthlyAdjustment: 0, retiringOwner: 'A' },
    ];

    const months = new Forecast(input).monthlyForecasts;

    expect(months[12 * 2].contribution).toBeCloseTo(
      500 - 200 / input.taxDeferredCashRate,
      0
    );
  });
});

describe('Retirement without take-home', () => {
  it('keeps the working partner saving as today', () => {
    const input = baseInput({ monthlyContribution: 4000, annualExpenses: 60000 });
    input.householdMembers = [
      { ownerCode: 'A', monthlyContribution: 2000, payrollContribution: 0, takeHome: 0 },
      { ownerCode: 'B', monthlyContribution: 2000, payrollContribution: 500, takeHome: 0 },
    ];
    input.contributionAdjustments = [
      { name: 'A retires', startDate: yearsFromNow(1), monthlyAdjustment: 0, retiringOwner: 'A' },
    ];

    expect(new Forecast(input).monthlyForecasts[12 * 2].contribution).toBe(2000);
  });
});

describe('requiredMonthlyContribution', () => {
  it('returns 0 when the milestone is already met', () => {
    const input = baseInput();
    input.netWorth = input.fiNumber;
    expect(requiredMonthlyContribution(input, 'fi', yearsFromNow(1))).toBe(0);
  });

  it('finds the smallest contribution that reaches FI by the target', () => {
    const input = baseInput();
    const target = yearsFromNow(15);

    const required = requiredMonthlyContribution(input, 'fi', target);

    expect(required).toBeGreaterThan(0);
    expect(fiDateWith(input, required).getTime()).toBeLessThanOrEqual(
      target.getTime()
    );
    const justShort = fiDateWith(input, required - 2);
    expect(!justShort || justShort > target).toBeTrue();
  });
});
