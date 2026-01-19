import { Injectable } from '@angular/core';
import { DebtInput } from '../models/debt-input.model';
import { PrePayment } from '../models/pre-payment.model';
import { RateChange } from '../models/rate-change.model';
import { Adjustment } from '../input/debt-input.component';
import {
  AmortizationResult,
  PaymentRow,
  YearlySummary,
} from '../models/amortization.model';

@Injectable({
  providedIn: 'root',
})
export class DebtCalculatorService {
  calculateMonthlyPayment(
    principal: number,
    annualRate: number,
    months: number,
  ): number {
    if (annualRate === 0) {
      return principal / months;
    }
    const monthlyRate = annualRate / 12;
    return (
      (principal * monthlyRate * Math.pow(1 + monthlyRate, months)) /
      (Math.pow(1 + monthlyRate, months) - 1)
    );
  }

  generateAmortization(
    input: DebtInput,
    adjustments: Adjustment[] = [],
  ): AmortizationResult {
    const prePayments = adjustments.filter(
      (a) => a.type === 'pre-payment',
    ) as PrePayment[];

    const rateChanges = adjustments.filter(
      (a) => a.type === 'rate-change',
    ) as RateChange[];

    const now = new Date();
    const endDate = new Date(input.endDate);
    const remainingMonths = this.monthsBetween(now, endDate);

    let balance = input.currentBalance;
    let monthlyRate = input.currentRate / 12;
    let monthlyPayment =
      input.currentMonthlyPayment > 0
        ? input.currentMonthlyPayment
        : this.calculateMonthlyPayment(
            balance,
            input.currentRate,
            remainingMonths,
          );

    const schedule: PaymentRow[] = [];
    let totalInterest = 0;
    let totalPayments = 0;
    let paymentNumber = 0;
    let currentDate = new Date(now.getFullYear(), now.getMonth(), 1);

    const sortedRates = [...rateChanges].sort(
      (a, b) => a.effectiveDate.getTime() - b.effectiveDate.getTime(),
    );
    let rateIndex = 0;

    while (balance > 0.01 && paymentNumber < remainingMonths * 2) {
      paymentNumber++;
      while (
        rateIndex < sortedRates.length &&
        sortedRates[rateIndex].effectiveDate <= currentDate
      ) {
        const annualRate = sortedRates[rateIndex].rate / 100; // Convert percentage to decimal
        monthlyRate = annualRate / 12;
        monthlyPayment =
          input.currentMonthlyPayment > 0
            ? input.currentMonthlyPayment
            : this.calculateMonthlyPayment(
                balance,
                annualRate,
                remainingMonths - paymentNumber + 1,
              );
        rateIndex++;
      }

      const interest = balance * monthlyRate;
      const recurringExtra = this.getRecurringExtraForMonth(prePayments, currentDate);
      const oneTimeExtra = this.getOneTimeExtraForMonth(prePayments, currentDate);
      const totalExtra = recurringExtra + oneTimeExtra;

      const minimumPayment = Math.min(monthlyPayment, balance + interest);
      const scheduledPayment = minimumPayment + recurringExtra;

      let principal = Math.min(monthlyPayment - interest, balance);
      if (principal > balance - totalExtra) {
        principal = balance - totalExtra;
        if (principal < 0) principal = 0;
      }

      balance = Math.max(0, balance - principal - totalExtra);
      totalInterest += interest;
      totalPayments += minimumPayment + totalExtra;

      schedule.push({
        paymentNumber,
        date: new Date(currentDate),
        minimumPayment,
        scheduledPayment,
        principal,
        interest,
        oneTimeExtra,
        balance,
      });

      currentDate = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth() + 1,
        1,
      );
    }

    const payoffDate =
      schedule.length > 0 ? schedule[schedule.length - 1].date : now;

    return {
      schedule,
      yearlySummary: this.generateYearlySummary(schedule),
      totalPayments,
      totalInterest,
      payoffDate,
      payoffMonths: schedule.length,
    };
  }

  generateYearlySummary(schedule: PaymentRow[]): YearlySummary[] {
    const yearlyMap = new Map<number, YearlySummary>();

    for (const row of schedule) {
      const year = row.date.getFullYear();
      if (!yearlyMap.has(year)) {
        yearlyMap.set(year, {
          year,
          totalPayments: 0,
          totalPrincipal: 0,
          totalInterest: 0,
          totalExtra: 0,
          endingBalance: 0,
        });
      }
      const summary = yearlyMap.get(year)!;
      summary.totalPayments += row.scheduledPayment + row.oneTimeExtra;
      summary.totalPrincipal += row.principal;
      summary.totalInterest += row.interest;
      summary.totalExtra += row.oneTimeExtra;
      summary.endingBalance = row.balance;
    }

    return Array.from(yearlyMap.values()).sort((a, b) => a.year - b.year);
  }

  private getRecurringExtraForMonth(prePayments: PrePayment[], date: Date): number {
    let total = 0;
    const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);

    for (const pp of prePayments) {
      if (pp.frequency !== 'recurring') continue;

      const ppStart = new Date(pp.startDate);
      const ppEnd = pp.endDate ? new Date(pp.endDate) : null;
      const ppStartMonth = new Date(ppStart.getFullYear(), ppStart.getMonth(), 1);
      const ppEndMonth = ppEnd ? new Date(ppEnd.getFullYear(), ppEnd.getMonth(), 1) : null;

      if (ppStartMonth <= monthStart && (!ppEndMonth || ppEndMonth >= monthStart)) {
        total += pp.amount;
      }
    }
    return total;
  }

  private getOneTimeExtraForMonth(prePayments: PrePayment[], date: Date): number {
    let total = 0;
    const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);

    for (const pp of prePayments) {
      if (pp.frequency !== 'one-time') continue;

      const ppStart = new Date(pp.startDate);
      const ppStartMonth = new Date(ppStart.getFullYear(), ppStart.getMonth(), 1);

      if (ppStartMonth.getTime() === monthStart.getTime()) {
        total += pp.amount;
      }
    }
    return total;
  }

  private monthsBetween(start: Date, end: Date): number {
    return (
      (end.getFullYear() - start.getFullYear()) * 12 +
      (end.getMonth() - start.getMonth())
    );
  }
}
