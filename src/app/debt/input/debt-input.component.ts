import { Component, OnInit, Output, EventEmitter } from '@angular/core';
import * as ynab from 'ynab';

import { YnabApiService } from '../../ynab-api/ynab-api.service';
import { DebtInput } from '../models/debt-input.model';
import { PrePayment } from '../models/pre-payment.model';
import { RateChange } from '../models/rate-change.model';

export type Adjustment = PrePayment | RateChange;

interface DebtAccount {
  id: string;
  name: string;
  balance: number;
}

@Component({
  selector: 'app-debt-input',
  templateUrl: 'debt-input.component.html',
  standalone: false,
})
export class DebtInputComponent implements OnInit {
  @Output() debtInputChange = new EventEmitter<DebtInput>();
  @Output() adjustmentsChange = new EventEmitter<Adjustment[]>();

  budgets: ynab.BudgetSummary[] = [];
  selectedBudgetId: string = '';
  debtAccounts: DebtAccount[] = [];
  selectedAccountId: string = '';

  currentRate: number = 5.0;
  endDate: string = '';
  currentMonthlyPayment: number = 0;

  adjustments: Adjustment[] = [];
  isUsingSampleData = false;

  constructor(private ynabService: YnabApiService) {
    // TODO: Remove this migration in a future release.
    for (const key of ['selected-budget', 'debt-settings', 'debt-adjustments']) {
      const oldVal = window.localStorage.getItem(`br4-${key}`);
      if (oldVal !== null && window.localStorage.getItem(`ff-${key}`) === null) {
        window.localStorage.setItem(`ff-${key}`, oldVal);
      }
    }
    this.loadAdjustments();
    this.loadDebtSettings();
  }

  async ngOnInit() {
    this.isUsingSampleData = this.ynabService.isUsingSampleData();
    this.budgets = await this.ynabService.getBudgets();

    const storageBudgetId = window.localStorage.getItem('ff-selected-budget');
    if (storageBudgetId && this.budgets.some((b) => b.id === storageBudgetId)) {
      this.selectedBudgetId = storageBudgetId;
    } else if (this.budgets.length > 0) {
      this.selectedBudgetId = this.budgets[0].id;
    }

    if (this.selectedBudgetId) {
      await this.onBudgetChange();
    }
  }

  async onBudgetSelect(budgetId: string) {
    this.selectedBudgetId = budgetId;
    window.localStorage.setItem('ff-selected-budget', budgetId);
    await this.onBudgetChange();
  }

  async onBudgetChange() {
    if (!this.selectedBudgetId) return;
    window.localStorage.setItem('ff-selected-budget', this.selectedBudgetId);

    const budget = await this.ynabService.getBudgetById(this.selectedBudgetId);
    this.debtAccounts = budget.accounts
      .filter(
        (a) =>
          !a.closed &&
          !a.deleted &&
          a.balance < 0 &&
          (a.name.toLowerCase().includes('mortgage') ||
            a.name.toLowerCase().includes('loan')),
      )
      .map((a) => ({
        id: a.id,
        name: a.name,
        balance: Math.abs(
          ynab.utils.convertMilliUnitsToCurrencyAmount(a.balance),
        ),
      }));

    if (this.debtAccounts.length > 0) {
      this.selectedAccountId = this.debtAccounts[0].id;
      this.onAccountChange();
    }
  }

  onAccountChange() {
    this.emitDebtInput();
  }

  onRateChange() {
    this.saveDebtSettings();
    this.emitDebtInput();
  }

  onEndDateChange() {
    this.saveDebtSettings();
    this.emitDebtInput();
  }

  onMonthlyPaymentChange() {
    this.saveDebtSettings();
    this.emitDebtInput();
  }

  private emitDebtInput() {
    const account = this.debtAccounts.find(
      (a) => a.id === this.selectedAccountId,
    );
    if (!account || !this.endDate) return;

    const input: DebtInput = {
      accountId: account.id,
      accountName: account.name,
      currentBalance: account.balance,
      currentRate: this.currentRate / 100,
      endDate: new Date(this.endDate),
      currentMonthlyPayment: this.currentMonthlyPayment,
    };

    this.debtInputChange.emit(input);
  }

  getDateString(date: Date): string {
    if (!date) return '';
    const d = new Date(date);
    return d.toISOString().split('T')[0];
  }

  private saveDebtSettings() {
    window.localStorage.setItem(
      'ff-debt-settings',
      JSON.stringify({
        currentRate: this.currentRate,
        endDate: this.endDate,
        currentMonthlyPayment: this.currentMonthlyPayment,
      }),
    );
  }

  private loadDebtSettings() {
    const stored = window.localStorage.getItem('ff-debt-settings');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        this.currentRate = parsed.currentRate ?? 5.0;
        this.endDate = parsed.endDate ?? '';
        this.currentMonthlyPayment = parsed.currentMonthlyPayment ?? 0;
      } catch {
        // Use defaults
      }
    }
  }

  private saveAdjustments() {
    window.localStorage.setItem(
      'ff-debt-adjustments',
      JSON.stringify(this.adjustments),
    );
  }

  private loadAdjustments() {
    const stored = window.localStorage.getItem('ff-debt-adjustments');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        this.adjustments = parsed.map((adj: any) => {
          if (adj.type === 'pre-payment') {
            return {
              ...adj,
              startDate: new Date(adj.startDate),
              endDate: adj.endDate ? new Date(adj.endDate) : undefined,
            } as PrePayment;
          } else {
            return {
              ...adj,
              effectiveDate: new Date(adj.effectiveDate),
            } as RateChange;
          }
        });
      } catch {
        this.adjustments = [];
      }
    } else {
      this.adjustments = [];
    }
  }
  private emitAdjustments() {
    this.adjustmentsChange.emit([...this.adjustments]);
  }

  setPrePaymentStartDate(index: number, dateString: string) {
    const adj = this.adjustments[index];
    if (adj.type === 'pre-payment') {
      adj.startDate = new Date(dateString);
      this.saveAdjustments();
      this.emitAdjustments();
    }
  }

  setPrePaymentEndDate(index: number, dateString: string) {
    const adj = this.adjustments[index];
    if (adj.type === 'pre-payment') {
      adj.endDate = dateString ? new Date(dateString) : undefined;
      this.saveAdjustments();
      this.emitAdjustments();
    }
  }

  setRateChangeDate(index: number, dateString: string) {
    const adj = this.adjustments[index];
    if (adj.type === 'rate-change') {
      adj.effectiveDate = new Date(dateString);
      this.saveAdjustments();
      this.emitAdjustments();
    }
  }

  addAdjustment() {
    this.adjustments.push({
      type: 'pre-payment',
      name: '',
      amount: 0,
      frequency: 'one-time',
      startDate: new Date(),
    });
    this.saveAdjustments();
    this.emitAdjustments();
  }

  onAdjustmentTypeChange(
    index: number,
    newType: 'pre-payment' | 'rate-change',
  ) {
    const adj = this.adjustments[index];
    if (adj.type === newType) return;

    if (newType === 'pre-payment') {
      this.adjustments[index] = {
        type: 'pre-payment',
        name: adj.name,
        amount: 0,
        frequency: 'one-time',
        startDate: new Date(),
      };
    } else {
      this.adjustments[index] = {
        type: 'rate-change',
        name: adj.name,
        rate: this.currentRate,
        effectiveDate: new Date(),
      };
    }
    this.saveAdjustments();
    this.emitAdjustments();
  }

  removeAdjustment(index: number) {
    this.adjustments.splice(index, 1);
    this.saveAdjustments();
    this.emitAdjustments();
  }

  swapAdjustments(i: number, j: number) {
    const tmp = this.adjustments[i];
    this.adjustments[i] = this.adjustments[j];
    this.adjustments[j] = tmp;
    this.saveAdjustments();
    this.emitAdjustments();
  }

  onAdjustmentChange() {
    const completeAdjustments = this.adjustments.filter(
      (adj) =>
        adj.name &&
        ((adj.type === 'pre-payment' && adj.amount != null && adj.startDate) ||
          (adj.type === 'rate-change' &&
            adj.rate != null &&
            adj.effectiveDate)),
    );
    this.adjustments = completeAdjustments;
    this.saveAdjustments();
    this.emitAdjustments();
  }
}
