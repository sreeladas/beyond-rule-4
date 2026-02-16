import { Component, OnInit, Output, EventEmitter } from '@angular/core';
import {
  UntypedFormGroup,
  UntypedFormArray,
  UntypedFormBuilder,
  Validators,
} from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { timer } from 'rxjs';
import { debounce } from 'rxjs/operators';
import * as ynab from 'ynab';

import { YnabApiService } from '../../../ynab-api/ynab-api.service';
import { CalculateInput } from '../../models/calculate-input.model';
import { round } from '../../utilities/number-utility';
import CategoryUtility from './category-utility';
import NoteUtility, { Overrides } from './note-utility';
import { Birthdate } from './birthdate-utility';
import { getSelectedMonths, QuickSelectMonthChoice } from './months-utility';

@Component({
  selector: 'app-ynab',
  templateUrl: 'ynab.component.html',
  styleUrls: ['./ynab.component.css'],
  standalone: false,
})
export class YnabComponent implements OnInit {
  @Output() calculateInputChange = new EventEmitter<CalculateInput>();

  budgetForm: UntypedFormGroup;
  displayContributionInfo = true;
  isBalanceHelpCollapsed = true;
  isContributionHelpCollapsed = true;
  isExpenseHelpCollapsed = true;
  currencyIsoCode = 'CAD';
  availableCurrencies = [
    'AUD',
    'BRL',
    'CAD',
    'CHF',
    'DKK',
    'EUR',
    'GBP',
    'HKD',
    'INR',
    'JPY',
    'MXN',
    'NOK',
    'NZD',
    'SEK',
    'SGD',
    'USD',
    'ZAR',
  ];
  public safeWithdrawalRatePercentage = 4.0;
  public expectedAnnualGrowthRate = 7.0;
  public retirementAge = 60;

  public budgets: ynab.BudgetSummary[];
  public budget: ynab.BudgetDetail;
  public months: ynab.MonthDetail[];
  public currentMonth: ynab.MonthDetail;
  public selectedMonthA: ynab.MonthDetail;
  public selectedMonthB: ynab.MonthDetail;
  public includeHiddenYnabCategories = false;
  public categoryGroupsWithCategories: ynab.CategoryGroupWithCategories[];

  public ynabNetWorth: number;
  public netWorth: number;
  public categoriesDisplay: any;
  public monthlyExpenses: number;
  public leanMonthlyExpenses: number;
  public contributionAdjustments: any[] = [];
  public expenses: {
    ynab: {
      monthly: number;
      annual: number;
    };
    fi: {
      monthly: number;
      annual: number;
    };
    leanFi: {
      monthly: number;
      annual: number;
    };
  };
  public contributionCategories: any;
  public isUsingSampleData = false;
  public birthdate: Birthdate;

  constructor(
    private ynabService: YnabApiService,
    private formBuilder: UntypedFormBuilder,
    private activatedRoute: ActivatedRoute,
  ) {
    this.expenses = {
      ynab: {
        monthly: 0,
        annual: 0,
      },
      fi: {
        monthly: 0,
        annual: 0,
      },
      leanFi: {
        monthly: 0,
        annual: 0,
      },
    };

    // Migrate localStorage keys from br4- to ff-.
    // TODO: Remove this migration in a future release.
    this.migrateLocalStorageKeys();

    const safeWithdrawalRatePercentageStorage = parseFloat(
      window.localStorage.getItem('ff-safe-withdrawal-rate'),
    );
    if (
      !!safeWithdrawalRatePercentageStorage &&
      !isNaN(safeWithdrawalRatePercentageStorage)
    ) {
      this.safeWithdrawalRatePercentage = safeWithdrawalRatePercentageStorage;
    }

    const expectedAnnualGrowthRateStorage = parseFloat(
      window.localStorage.getItem('ff-expect-annual-growth-rate'),
    );
    if (
      !!expectedAnnualGrowthRateStorage &&
      !isNaN(expectedAnnualGrowthRateStorage)
    ) {
      this.expectedAnnualGrowthRate = expectedAnnualGrowthRateStorage;
    }

    try {
      this.birthdate = JSON.parse(window.localStorage.getItem('ff-birthdate'));
    } catch {
      this.birthdate = null;
    }
    if (!this.birthdate) {
      this.birthdate = {
        year: new Date().getFullYear() - 25,
        month: 1,
        day: 1,
      };
    }

    const storedCurrency = window.localStorage.getItem('ff-currency');
    if (storedCurrency) {
      this.currencyIsoCode = storedCurrency;
    }

    const retirementAgeStorage = parseFloat(
      window.localStorage.getItem('ff-retirement-age'),
    );
    if (!!retirementAgeStorage && !isNaN(retirementAgeStorage)) {
      this.retirementAge = retirementAgeStorage;
    }

    this.budgetForm = this.formBuilder.group({
      selectedBudget: ['', [Validators.required]],
      selectedMonthA: ['', [Validators.required]],
      selectedMonthB: ['', [Validators.required]],
      monthlyContribution: [0, [Validators.required]],
      includeHiddenYnabCategories: [true],
      categoryGroups: this.formBuilder.array([]),
      accounts: this.formBuilder.array([]),
      safeWithdrawalRatePercentage: [
        this.safeWithdrawalRatePercentage,
        [Validators.required, Validators.max(99.99), Validators.max(0.01)],
      ],
      expectedAnnualGrowthRate: [
        this.expectedAnnualGrowthRate,
        [Validators.required, Validators.max(99.99), Validators.max(0.01)],
      ],
      birthdate: [this.birthdate, [Validators.required]],
      retirementAge: [
        this.retirementAge,
        [Validators.required, Validators.min(18), Validators.max(100)],
      ],
    });
  }

  get categoryGroups(): UntypedFormArray {
    return this.budgetForm.get('categoryGroups') as UntypedFormArray;
  }

  get accounts(): UntypedFormArray {
    return this.budgetForm.get('accounts') as UntypedFormArray;
  }

  async ngOnInit() {
    this.isUsingSampleData = this.ynabService.isUsingSampleData();

    const formChanges = this.budgetForm.valueChanges.pipe(
      debounce(() => timer(500)),
    );
    formChanges.subscribe(() => {
      this.handleFormChanges();
    });

    this.budgets = await this.ynabService.getBudgets();
    this.contributionAdjustments = this.loadContributionAdjustments();

    const budgetId = this.setInitialSelectedBudget();
    await this.selectBudget(budgetId);
  }

  recalculate() {
    const fiMonthlyExpenses = this.getMonthlyExpenses(
      this.budgetForm.value.categoryGroups,
      'fiBudget',
    );
    const leanMonthlyExpenses = this.getMonthlyExpenses(
      this.budgetForm.value.categoryGroups,
      'leanFiBudget',
    );
    const retrievedBudgetedMonthlyExpenses = this.getMonthlyExpenses(
      this.budgetForm.value.categoryGroups,
      'retrievedBudgeted',
    );

    this.setNetWorth();

    this.expenses = {
      ynab: {
        monthly: retrievedBudgetedMonthlyExpenses,
        annual: retrievedBudgetedMonthlyExpenses * 12,
      },
      fi: {
        monthly: fiMonthlyExpenses,
        annual: fiMonthlyExpenses * 12,
      },
      leanFi: {
        monthly: leanMonthlyExpenses,
        annual: leanMonthlyExpenses * 12,
      },
    };

    const taxRatios = this.calculateTaxRatios();

    const result = new CalculateInput();
    result.annualExpenses = this.expenses.fi.annual;
    result.leanAnnualExpenses = this.expenses.leanFi.annual;
    result.netWorth = this.netWorth;
    result.monthlyContribution = this.budgetForm.value.monthlyContribution;
    result.budgetCategoryGroups = this.budgetForm.value.categoryGroups;
    result.currencyIsoCode = this.currencyIsoCode;
    result.monthFromName = this.selectedMonthA.month;
    result.monthToName = this.selectedMonthB.month;
    result.birthdate = this.birthdate;
    result.retirementAge = this.retirementAge;

    result.annualSafeWithdrawalRate = Math.max(
      0,
      this.safeWithdrawalRatePercentage / 100,
    );
    result.expectedAnnualGrowthRate = Math.max(
      0,
      this.expectedAnnualGrowthRate / 100,
    );

    if (taxRatios) {
      result.taxFreeRatio = taxRatios.taxFreeRatio;
      result.taxDeferredRatio = taxRatios.taxDeferredRatio;
      result.investmentIncomeRatio = taxRatios.investmentIncomeRatio;
    }

    const storedAdjustments = this.loadContributionAdjustments();
    if (storedAdjustments) {
      result.contributionAdjustments = storedAdjustments;
    }

    result.isUsingSampleData = this.isUsingSampleData;
    result.roundAll();
    this.calculateInputChange.emit(result);
  }

  private loadContributionAdjustments() {
    const stored = window.localStorage.getItem('ff-contribution-adjustments');
    if (!stored) {
      return [];
    }
    try {
      const parsed = JSON.parse(stored);
      return parsed.map((adj) => ({
        name: adj.name,
        startDate:
          typeof adj.startDate === 'string'
            ? new Date(adj.startDate)
            : adj.startDate,
        monthlyAdjustment: adj.monthlyAdjustment,
      }));
    } catch (e) {
      console.error('Failed to parse contribution adjustments', e);
      return [];
    }
  }

  saveContributionAdjustments(adjustments) {
    const serialized = adjustments.map((adj) => ({
      name: adj.name,
      startDate:
        adj.startDate instanceof Date
          ? adj.startDate.toISOString().split('T')[0]
          : adj.startDate,
      monthlyAdjustment: adj.monthlyAdjustment,
    }));
    window.localStorage.setItem(
      'ff-contribution-adjustments',
      JSON.stringify(serialized),
    );
    this.recalculate();
  }

  addAdjustment() {
    this.contributionAdjustments = [
      ...this.contributionAdjustments,
      {
        name: '',
        startDate: new Date(),
        monthlyAdjustment: 0,
      },
    ];
    this.saveContributionAdjustments(this.contributionAdjustments);
  }

  removeAdjustment(index: number) {
    this.contributionAdjustments.splice(index, 1);
    this.saveContributionAdjustments(this.contributionAdjustments);
  }

  updateAdjustmentDate(index: number, dateString: string) {
    this.contributionAdjustments[index].startDate = new Date(dateString);
    this.saveContributionAdjustments(this.contributionAdjustments);
  }

  getDateString(date: Date | string): string {
    if (typeof date === 'string') {
      return date;
    }
    if (date instanceof Date) {
      return date.toISOString().split('T')[0];
    }
    return '';
  }

  setAdjustmentDate(index: number, dateString: string) {
    this.contributionAdjustments[index].startDate = new Date(dateString);
    this.saveContributionAdjustments(this.contributionAdjustments);
  }

  swapAdjustments(index1: number, index2: number) {
    const temp = this.contributionAdjustments[index1];
    this.contributionAdjustments[index1] = this.contributionAdjustments[index2];
    this.contributionAdjustments[index2] = temp;
    this.saveContributionAdjustments(this.contributionAdjustments);
  }

  onAdjustmentChange() {
    this.saveContributionAdjustments(this.contributionAdjustments);
  }

  trackAdjustment(index: number, item: any) {
    return index;
  }

  async selectBudget(budgetId: string) {
    this.calculateInputChange.emit(undefined);
    this.budget = await this.ynabService.getBudgetById(budgetId);
    window.localStorage.setItem('ff-selected-budget', this.budget.id);

    this.months = this.budget.months;

    try {
      this.currentMonth = await this.ynabService.getMonth(budgetId, 'current');
    } catch {
      // on older accounts, this can 404 if they're not up to date. That's fine, we'll use the first month
      this.currentMonth = this.months[0];
    }

    this.categoryGroupsWithCategories =
      await this.ynabService.getCategoryGroupsWithCategories(this.budget.id);
    const storedCurrency = window.localStorage.getItem('ff-currency');
    if (storedCurrency) {
      this.currencyIsoCode = storedCurrency;
    } else if (this.budget.currency_format) {
      this.currencyIsoCode = this.budget.currency_format.iso_code;
    }

    this.includeHiddenYnabCategories = !!window.localStorage.getItem(
      'ff-include-hidden-ynab-categories',
    );

    const selectedMonths = getSelectedMonths(
      this.currentMonth,
      this.months,
      'previousChoice',
    );
    await this.selectMonths(selectedMonths.from.month, selectedMonths.to.month);
  }

  onCurrencyChange(newCurrency: string) {
    this.currencyIsoCode = newCurrency;
    window.localStorage.setItem('ff-currency', newCurrency);
    this.recalculate();
  }

  toggleIncludeHiddenYnabCategories(newValue: boolean) {
    this.includeHiddenYnabCategories = newValue;
    if (newValue) {
      window.localStorage.setItem(
        'ff-include-hidden-ynab-categories',
        newValue.toString(),
      );
    } else {
      window.localStorage.removeItem('ff-include-hidden-ynab-categories');
    }
  }

  /**
   * Select months and reset the form with the categories
   *
   * @param monthA start month
   * @param monthB end month
   */
  async selectMonths(monthA: string, monthB: string) {
    const months = this.setMonths(monthA, monthB);

    const mappedAccounts = this.mapAccounts(this.budget.accounts);

    const mappedCategoryGroups = CategoryUtility.mapCategoryGroups(
      this.categoryGroupsWithCategories,
      months,
      this.includeHiddenYnabCategories,
    );
    const monthlyContribution = this.getMonthlyContribution(
      mappedCategoryGroups,
      mappedAccounts,
    );
    this.contributionCategories = monthlyContribution.categories;

    this.resetForm(
      mappedCategoryGroups,
      monthlyContribution.value,
      mappedAccounts,
    );

    this.recalculate();
  }

  /* Chooses months based on common decisions. Options: All, Last calendar year, Last 12 months, Year to date, Current month. */
  async quickChooseMonths(choice: QuickSelectMonthChoice) {
    // Get some etc facts that are shared by some of the buttons below.
    const currentMonth = this.currentMonth || this.months[0];
    let currentMonthIdx = 0;
    for (let i = 0; i < this.months.length; i++) {
      if (currentMonth.month === this.months[i].month) {
        currentMonthIdx = i;
      }
    }

    const selectedMonths = getSelectedMonths(currentMonth, this.months, choice);
    await this.selectMonths(selectedMonths.from.month, selectedMonths.to.month);
  }

  handlePercentageFormChanges() {
    const parsedSafeWithdrawalRatePercentage = Number.parseFloat(
      this.budgetForm.value.safeWithdrawalRatePercentage,
    );
    if (
      !Number.isNaN(parsedSafeWithdrawalRatePercentage) &&
      parsedSafeWithdrawalRatePercentage !== this.safeWithdrawalRatePercentage
    ) {
      this.safeWithdrawalRatePercentage = parsedSafeWithdrawalRatePercentage;
      // local storage
      window.localStorage.setItem(
        'ff-safe-withdrawal-rate',
        parsedSafeWithdrawalRatePercentage.toString(),
      );
    }
    const parsedExpectedAnnualGrowthRate = Number.parseFloat(
      this.budgetForm.value.expectedAnnualGrowthRate,
    );
    if (!Number.isNaN(parsedExpectedAnnualGrowthRate)) {
      this.expectedAnnualGrowthRate = parsedExpectedAnnualGrowthRate;
      // local storage
      window.localStorage.setItem(
        'ff-expect-annual-growth-rate',
        parsedExpectedAnnualGrowthRate.toString(),
      );
    }
    const parsedRetirementAge = Number.parseFloat(
      this.budgetForm.value.retirementAge,
    );
    if (!Number.isNaN(parsedRetirementAge)) {
      this.retirementAge = parsedRetirementAge;
      // local storage
      window.localStorage.setItem(
        'ff-retirement-age',
        parsedRetirementAge.toString(),
      );
    }
  }

  handleFormChanges() {
    let toggledHidden = false;
    if (
      this.includeHiddenYnabCategories !==
      this.budgetForm.value.includeHiddenYnabCategories
    ) {
      toggledHidden = true;
      this.toggleIncludeHiddenYnabCategories(
        this.budgetForm.value.includeHiddenYnabCategories,
      );
    }

    this.handlePercentageFormChanges();

    this.birthdate = this.budgetForm.value.birthdate;
    window.localStorage.setItem('ff-birthdate', JSON.stringify(this.birthdate));

    const selectedBudget = this.budgetForm.value.selectedBudget;
    if (this.budget.id !== selectedBudget) {
      // calls selectMonths after it's done resetting
      this.selectBudget(selectedBudget);
      return;
    }

    if (
      toggledHidden ||
      this.selectedMonthA.month !== this.budgetForm.value.selectedMonthA ||
      this.selectedMonthB.month !== this.budgetForm.value.selectedMonthB
    ) {
      this.selectMonths(
        this.budgetForm.value.selectedMonthA,
        this.budgetForm.value.selectedMonthB,
      );
      return;
    }

    this.recalculate();
  }

  private setInitialSelectedBudget(): string {
    let selectedBudget = 'last-used';

    const storageBudget = window.localStorage.getItem('ff-selected-budget');
    if (storageBudget && this.budgets.some((b) => b.id === storageBudget)) {
      selectedBudget = storageBudget;
    }

    const queryBudget = this.activatedRoute.snapshot.queryParams['budgetId'];
    if (queryBudget && this.budgets.some((b) => b.id === queryBudget)) {
      selectedBudget = queryBudget;
    }

    return selectedBudget;
  }

  private setMonths(monthA: string, monthB: string): ynab.MonthDetail[] {
    const result = new Array<ynab.MonthDetail>();
    let inRange = false;
    for (const month of this.months) {
      if (month.month === monthA || month.month === monthB) {
        if (inRange) {
          this.selectedMonthA = month;
          result.push(month);
          break;
        }

        this.selectedMonthB = month;
        if (monthA === monthB) {
          this.selectedMonthA = month;
          result.push(month);
          break;
        }
        inRange = true;
      }
      if (inRange) {
        result.push(month);
      }
    }
    return result;
  }

  private getMonthlyExpenses(categoryGroups, budgetPropertyName) {
    const expenses = categoryGroups
      .map((categoryGroup) => {
        if (!categoryGroup.categories || !categoryGroup.categories.length) {
          return 0;
        }
        return categoryGroup.categories
          .map((category) => category[budgetPropertyName])
          .reduce((prev, next) => prev + next, 0);
      })
      .reduce((prev, next) => prev + next, 0);

    return round(expenses);
  }

  private setNetWorth() {
    let ynabNetWorth = 0;
    let netWorth = 0;
    this.accounts.controls.forEach((a) => {
      const ynabBalance = Number.parseFloat(a.value.ynabBalance);
      if (!Number.isNaN(ynabBalance)) {
        ynabNetWorth += ynabBalance;
      }
      const balance = Number.parseFloat(a.value.balance);
      if (!Number.isNaN(balance)) {
        netWorth += balance;
      }
    });

    this.ynabNetWorth = ynabNetWorth;
    this.netWorth = netWorth;
  }

  private calculateTaxRatios() {
    let taxFreeBalance = 0;
    let taxDeferredBalance = 0;
    let taxableBalance = 0;

    this.accounts.controls.forEach((a) => {
      const balance = Number.parseFloat(a.value.balance);
      if (Number.isNaN(balance) || balance <= 0) {
        return;
      }

      const taxTreatment = a.value.taxTreatment;
      switch (taxTreatment) {
        case 'tax-free':
          taxFreeBalance += balance;
          break;
        case 'tax-deferred':
          taxDeferredBalance += balance;
          break;
        case 'taxable':
          taxableBalance += balance;
          break;
      }
    });

    const categoryGroups = this.budgetForm.value.categoryGroups || [];
    categoryGroups.forEach((group) => {
      group.categories.forEach((category) => {
        if (category.taxFreeContribution) {
          taxFreeBalance += category.taxFreeContribution;
        }
        if (category.taxDeferredContribution) {
          taxDeferredBalance += category.taxDeferredContribution;
        }
        if (category.taxableContribution) {
          taxableBalance += category.taxableContribution;
        }
      });
    });

    const totalBalance = taxFreeBalance + taxDeferredBalance + taxableBalance;
    if (totalBalance === 0) {
      return null;
    }

    return {
      taxFreeRatio: taxFreeBalance / totalBalance,
      taxDeferredRatio: taxDeferredBalance / totalBalance,
      investmentIncomeRatio: taxableBalance / totalBalance,
    };
  }

  private mapAccounts(accounts: ynab.Account[]) {
    const mapped = accounts
      .filter((a) => !(a.closed || a.deleted))
      .map((account) => {
        const ynabBalance = ynab.utils.convertMilliUnitsToCurrencyAmount(
          account.balance,
        );
        const overrides = NoteUtility.getNoteOverrides(
          account.note,
          ynabBalance,
        );

        return this.formBuilder.group(
          Object.assign({}, account, {
            balance: this.getAccountBalance(account, ynabBalance, overrides),
            ynabBalance,
            monthlyContribution: overrides.monthlyContribution,
            taxTreatment: overrides.taxTreatment,
          }),
        );
      });
    return mapped;
  }

  private getAccountBalance(
    account: ynab.Account,
    ynabBalance: number,
    overrides: Overrides,
  ) {
    if (overrides.contributionBudget !== undefined) {
      return overrides.contributionBudget;
    }

    if (account.type === ynab.AccountType.OtherAsset) {
      return ynabBalance;
    }

    return 0;
  }

  private getMonthlyContribution(categoryGroups, accounts) {
    let contribution = 0;
    const categories = [];

    if (categoryGroups) {
      categoryGroups.forEach((cg) => {
        cg.categories.forEach((c) => {
          if (c.contributionBudget) {
            contribution += c.contributionBudget;
            categories.push({
              name: c.name,
              value: c.contributionBudget,
              info: c.info,
              hidden: c.hidden,
            });
          }
        });
      });
    }

    if (accounts) {
      accounts.forEach((a) => {
        const monthlyContribution = a.value.monthlyContribution;
        if (monthlyContribution) {
          contribution += monthlyContribution;
          categories.push({
            name: a.value.name,
            value: monthlyContribution,
            info: {
              mean: monthlyContribution,
              max: {
                value: monthlyContribution,
              },
              min: {
                value: monthlyContribution,
              },
            },
          });
        }
      });
    }

    return {
      value: round(contribution),
      categories,
    };
  }

  private resetForm(categoriesDisplay, monthlyContribution, mappedAccounts) {
    this.budgetForm.reset({
      selectedBudget: this.budget.id,
      selectedMonthA: this.selectedMonthA.month,
      selectedMonthB: this.selectedMonthB.month,
      includeHiddenYnabCategories: this.includeHiddenYnabCategories,
      monthlyContribution,
      expectedAnnualGrowthRate: this.expectedAnnualGrowthRate,
      safeWithdrawalRatePercentage: this.safeWithdrawalRatePercentage,
      birthdate: this.birthdate,
      retirementAge: this.retirementAge,
    });

    const categoryGroupFormGroups = categoriesDisplay.map((cg) =>
      this.formBuilder.group({
        name: cg.name,
        id: cg.id,
        hidden: cg.hidden,
        categories: this.formBuilder.array(
          cg.categories.map((c) =>
            this.formBuilder.group({
              name: c.name,
              retrievedBudgeted: c.retrievedBudgeted,
              computedFiBudget: c.computedFiBudget,
              computedLeanFiBudget: c.computedLeanFiBudget,
              fiBudget: c.computedFiBudget,
              leanFiBudget: c.computedLeanFiBudget,
              info: c.info,
              ignore: c.ignore,
              hidden: c.hidden,
            }),
          ),
        ),
      }),
    );

    this.budgetForm.setControl(
      'categoryGroups',
      this.formBuilder.array(categoryGroupFormGroups),
    );
    this.budgetForm.setControl(
      'accounts',
      this.formBuilder.array(mappedAccounts),
    );
  }

  // TODO: Remove this migration in a future release.
  private migrateLocalStorageKeys() {
    const legacyKeys = [
      'safe-withdrawal-rate',
      'expect-annual-growth-rate',
      'birthdate',
      'currency',
      'retirement-age',
      'selected-budget',
      'include-hidden-ynab-categories',
      'contribution-adjustments',
      'quick-months',
    ];
    for (const key of legacyKeys) {
      const oldVal = window.localStorage.getItem(`br4-${key}`);
      if (oldVal !== null && window.localStorage.getItem(`ff-${key}`) === null) {
        window.localStorage.setItem(`ff-${key}`, oldVal);
      }
    }
  }
}
