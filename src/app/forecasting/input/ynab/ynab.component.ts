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
import { OwnerService } from '../../../household-split/services/owner.service';
import {
  CalculateInput,
  HouseholdMember,
} from '../../models/calculate-input.model';
import {
  ContributionAdjustment,
  parseStoredAdjustments,
  serializeAdjustments,
} from '../../models/contribution-adjustment.model';
import {
  RoomCell,
  ContributionStream,
  ContributionTaxType,
  TaxAdvantagedType,
  TaxRatios,
  TerminalSplitOptions,
  DatedReshape,
  computeTerminalTaxRatios,
} from '../../models/contribution-allocator';
import {
  applyEvents,
  adjustmentToEvent,
  toDatedReshapes,
  toRetirements,
  toHouseholdAdjustments,
} from '../../models/scenario-event';
import { round } from '../../utilities/number-utility';
import CategoryUtility from './category-utility';
import NoteUtility, { Overrides } from './note-utility';
import { Birthdate } from './birthdate-utility';
import { getSelectedMonths, QuickSelectMonthChoice } from './months-utility';

// Income-percent rule for tax-deferred (RRSP-style) yearly new room: 18% of
// earned income, capped at `ff growth`. `ff limit` is the accumulated starting
// room. See contribution-allocator.ts.
const TAX_DEFERRED_INCOME_RATE = 0.18;

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
  public inflationRate = 2.5;
  public contributionGrowthRate = 0;

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
  // Accessible (taxable + tax-free) savings at today's scale; a net-worth
  // withdrawal larger than this would have to tap tax-deferred accounts.
  public accessibleNetWorth = 0;
  public householdOwners: string[] = [];
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
  // Realized terminal tax split (fractions, 0..1) when per-person contribution
  // room is active; null when no `ff room` notes exist (legacy snapshot path).
  public allocation: {
    taxFree: number;
    taxDeferred: number;
    taxable: number;
  } | null = null;
  public isUsingSampleData = false;
  public birthdate: Birthdate;

  constructor(
    private ynabService: YnabApiService,
    private formBuilder: UntypedFormBuilder,
    private activatedRoute: ActivatedRoute,
    private ownerService: OwnerService,
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

    // Use isNaN (not truthiness) so a stored 0% is honored.
    const inflationRateStorage = parseFloat(
      window.localStorage.getItem('ff-inflation-rate'),
    );
    if (!isNaN(inflationRateStorage)) {
      this.inflationRate = inflationRateStorage;
    }
    const contributionGrowthRateStorage = parseFloat(
      window.localStorage.getItem('ff-contribution-growth-rate'),
    );
    if (!isNaN(contributionGrowthRateStorage)) {
      this.contributionGrowthRate = contributionGrowthRateStorage;
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
      inflationRate: [
        this.inflationRate,
        [Validators.required, Validators.min(0), Validators.max(99.99)],
      ],
      contributionGrowthRate: [
        this.contributionGrowthRate,
        [Validators.required],
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

  // Projected monthly contribution after one year of ongoing nominal growth.
  get contributionAfterYear1(): number {
    const base = Number(this.budgetForm?.value?.monthlyContribution) || 0;
    const growth = Number(this.budgetForm?.value?.contributionGrowthRate) || 0;
    return base * (1 + growth / 100);
  }

  // Projected monthly contribution after two years of ongoing nominal growth.
  get contributionAfterYear2(): number {
    const base = Number(this.budgetForm?.value?.monthlyContribution) || 0;
    const growth = Number(this.budgetForm?.value?.contributionGrowthRate) || 0;
    return base * Math.pow(1 + growth / 100, 2);
  }

  // Whether the ongoing contribution growth beats, matches, or trails inflation.
  // Drives the buying-power message under the growth input.
  get contributionGrowthVsInflation(): 'outpaces' | 'matches' | 'trails' {
    const growth = Number(this.budgetForm?.value?.contributionGrowthRate) || 0;
    const inflation = Number(this.budgetForm?.value?.inflationRate) || 0;
    const diff = growth - inflation;
    if (diff > 0.001) {
      return 'outpaces';
    }
    if (diff < -0.001) {
      return 'trails';
    }
    return 'matches';
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
    result.inflationRate = Math.max(0, this.inflationRate / 100);
    result.contributionGrowthRate = this.contributionGrowthRate / 100;

    // Derive the terminal tax split by projecting bucket-tagged contributions
    // forward to retirement (capped contributions overflow to taxable; uncapped
    // when no room is declared). Only when there is nothing to project — no
    // tagged contribution streams — fall back to the legacy point-in-time
    // balance snapshot. A frozen snapshot is wrong whenever ongoing
    // contributions skew toward one bucket, so it is a last resort, not the
    // default.
    const yearsToRetirement = Math.max(
      0,
      Math.floor(result.retirementAge - result.currentAge),
    );

    // Only ENABLED rows shape the main forecast (disabled are ignored; compare
    // rows are held back for the Scenario Comparison card). Their net-worth
    // moves become DATED reshapes fed to the tax-bucket projection, so each
    // drains the balance as of its own date and multiple stack in time order.
    const enabled = (this.contributionAdjustments || []).filter(
      (a) => (a.state ?? 'enabled') === 'enabled',
    );
    const householdMembers = this.buildHouseholdMembers();
    this.householdOwners = householdMembers.map((m) => m.ownerCode);
    result.householdMembers = householdMembers;
    result.compareAdjustments = (this.contributionAdjustments || []).filter(
      (a) => a.state === 'compare',
    );

    const projection = this.buildTaxProjectionOptions(
      yearsToRetirement,
      result.contributionGrowthRate,
      toDatedReshapes(enabled),
      {
        retirements: toRetirements(enabled),
        householdAdjustments: toHouseholdAdjustments(enabled),
        annualTakeHomeByOwner: householdMembers
          .filter((m) => m.takeHome > 0)
          .reduce(
            (byOwner, m) => ({ ...byOwner, [m.ownerCode]: m.takeHome * 12 }),
            {},
          ),
        annualCosts:
          result.annualExpenses +
          enabled.reduce((sum, a) => sum + (a.expenseAdjustment || 0), 0),
        inflationRate: result.inflationRate,
        taxDeferredCashRate: result.taxDeferredCashRate,
        annualReturnRate:
          (1 + result.expectedAnnualGrowthRate) * (1 + result.inflationRate) - 1,
      },
    );

    // Contribution-only split (no withdrawals) drives the allocation display and
    // the accessible-savings figure the per-row warning compares against; the
    // final split additionally stacks the enabled withdrawals.
    const contribOnly = projection
      ? computeTerminalTaxRatios({ ...projection, reshapes: [] })
      : null;
    const allocatedFinal = projection
      ? computeTerminalTaxRatios(projection)
      : null;

    this.allocation = contribOnly
      ? {
          taxFree: contribOnly.taxFreeRatio,
          taxDeferred: contribOnly.taxDeferredRatio,
          taxable: contribOnly.investmentIncomeRatio,
        }
      : null;
    const taxRatios = allocatedFinal ?? this.calculateTaxRatios();

    if (taxRatios) {
      result.taxFreeRatio = taxRatios.taxFreeRatio;
      result.taxDeferredRatio = taxRatios.taxDeferredRatio;
      result.investmentIncomeRatio = taxRatios.investmentIncomeRatio;
    }
    result.taxProjection = projection ?? undefined;

    result.isUsingSampleData = this.isUsingSampleData;

    // Accessible (taxable + tax-free) savings at today's scale — how much a
    // withdrawal can cover before it must reach into tax-deferred accounts.
    const accessibleRatios = contribOnly ?? taxRatios;
    this.accessibleNetWorth = accessibleRatios
      ? (accessibleRatios.taxFreeRatio +
          accessibleRatios.investmentIncomeRatio) *
        result.netWorth
      : 0;

    // Fold the enabled rows' pool/contribution/expense effects (NOT tax ratios —
    // the projection above already did those) into the emitted input.
    const folded = applyEvents(result, enabled.map(adjustmentToEvent));

    this.calculateInputChange.emit(folded);
  }

  private loadContributionAdjustments(): ContributionAdjustment[] {
    return parseStoredAdjustments(
      window.localStorage.getItem('ff-contribution-adjustments'),
    );
  }

  saveContributionAdjustments(adjustments: ContributionAdjustment[]) {
    window.localStorage.setItem(
      'ff-contribution-adjustments',
      serializeAdjustments(adjustments),
    );
    this.recalculate();
  }

  addAdjustment() {
    this.contributionAdjustments = [
      ...this.contributionAdjustments,
      {
        name: '',
        startDate: new Date(),
        endDate: undefined,
        monthlyAdjustment: 0,
        retiringOwner: undefined,
        expenseAdjustment: 0,
        netWorthAdjustment: 0,
        state: 'enabled',
      },
    ];
    this.saveContributionAdjustments(this.contributionAdjustments);
  }

  setAdjustmentState(index: number, state: 'enabled' | 'disabled' | 'compare') {
    this.contributionAdjustments[index].state = state;
    this.saveContributionAdjustments(this.contributionAdjustments);
  }

  // True when this row's net-worth withdrawal is bigger than the accessible
  // (taxable + tax-free) savings, so it would have to reach into tax-deferred
  // accounts (RRSP/401k) that are usually locked until retirement. Disabled rows
  // never warn.
  netWorthTapsTaxDeferred(adj): boolean {
    if ((adj.state || 'enabled') === 'disabled') {
      return false;
    }
    const amount = adj.netWorthAdjustment || 0;
    return amount < 0 && -amount > this.accessibleNetWorth;
  }

  setAdjustmentEndDate(index: number, dateString: string) {
    this.contributionAdjustments[index].endDate = dateString
      ? new Date(dateString)
      : undefined;
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
    const parsedInflationRate = Number.parseFloat(
      this.budgetForm.value.inflationRate,
    );
    if (!Number.isNaN(parsedInflationRate)) {
      this.inflationRate = parsedInflationRate;
      window.localStorage.setItem(
        'ff-inflation-rate',
        parsedInflationRate.toString(),
      );
    }
    const parsedContributionGrowthRate = Number.parseFloat(
      this.budgetForm.value.contributionGrowthRate,
    );
    if (!Number.isNaN(parsedContributionGrowthRate)) {
      this.contributionGrowthRate = parsedContributionGrowthRate;
      window.localStorage.setItem(
        'ff-contribution-growth-rate',
        parsedContributionGrowthRate.toString(),
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

  // Inputs to the time-stepped terminal tax-split projection, honoring per-person
  // contribution room and stacking the given dated reshapes. Returns null when no
  // account declares a bucket-tagged stream, so the caller falls back to the
  // static balance snapshot (where dated reshaping isn't modeled).
  private buildTaxProjectionOptions(
    years: number,
    contributionGrowthRate: number,
    reshapes: DatedReshape[],
    retirementPhase: Pick<
      TerminalSplitOptions,
      | 'retirements'
      | 'householdAdjustments'
      | 'annualTakeHomeByOwner'
      | 'annualCosts'
      | 'inflationRate'
      | 'taxDeferredCashRate'
      | 'annualReturnRate'
    >,
  ): TerminalSplitOptions | null {
    const streams = this.buildContributionStreams();
    // Nothing to project forward -> defer to the static balance snapshot.
    // Otherwise always project: room cells cap the contributions that have a
    // configured limit and leave the rest uncapped (an empty cells array means
    // every stream lands fully in its own bucket).
    if (streams.length === 0) {
      return null;
    }
    return {
      cells: this.buildRoomCells(),
      streams,
      startingBalances: this.getBalanceSplit(),
      years,
      contributionGrowthRate,
      reshapes,
      ...retirementPhase,
    };
  }

  private buildHouseholdMembers(): HouseholdMember[] {
    const members = new Map<string, HouseholdMember>();
    this.accounts.controls.forEach((a) => {
      const monthlyContribution = this.parseAmount(a.value.monthlyContribution);
      const takeHome = this.parseAmount(a.value.takeHome);
      if (!monthlyContribution && !takeHome) {
        return;
      }
      const ownerCode = this.ownerService.ownerCodeForAccountName(a.value.name);
      const member = members.get(ownerCode) ?? {
        ownerCode,
        monthlyContribution: 0,
        payrollContribution: 0,
        takeHome: 0,
      };
      member.monthlyContribution += monthlyContribution;
      if (a.value.taxTreatment === 'tax-deferred') {
        member.payrollContribution += monthlyContribution;
      }
      member.takeHome = Math.max(member.takeHome, takeHome);
      members.set(ownerCode, member);
    });
    return [...members.values()];
  }

  private parseAmount(value): number {
    const parsed = Number.parseFloat(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  // Per-person, per-type contribution-room cells. `ff limit` is the total
  // accumulated room available now (starting room); `ff growth` is the dollar
  // amount of new room added each following year. For tax-deferred, `ff income`
  // sets that yearly new room to 18% of income (capped at `ff growth`). Owner/
  // type come from the account name and taxTreatment. Returns [] (legacy
  // snapshot) when nothing is configured; a person/type that contributes but
  // has no configured room gets 0, so all of it overflows to taxable.
  private buildRoomCells(): RoomCell[] {
    const incomeByOwner = this.incomeByOwner();

    // Limit/growth notes, aggregated per (owner, type).
    type NoteEntry = {
      ownerCode: string;
      type: TaxAdvantagedType;
      limit?: number;
      growth?: number;
    };
    const notes = new Map<string, NoteEntry>();
    this.accounts.controls.forEach((a) => {
      const type = a.value.taxTreatment;
      if (type !== 'tax-free' && type !== 'tax-deferred') {
        return;
      }
      const limit = Number.parseFloat(a.value.roomLimit);
      const growth = Number.parseFloat(a.value.roomGrowth);
      if (Number.isNaN(limit) && Number.isNaN(growth)) {
        return;
      }
      const ownerCode = this.ownerService.ownerCodeForAccountName(a.value.name);
      const k = `${ownerCode}::${type}`;
      const entry: NoteEntry = notes.get(k) ?? { ownerCode, type };
      if (!Number.isNaN(limit)) {
        entry.limit = Math.max(entry.limit ?? 0, limit);
      }
      if (!Number.isNaN(growth)) {
        entry.growth = Math.max(entry.growth ?? 0, growth);
      }
      notes.set(k, entry);
    });

    // Engage only when the user has configured limits or income somewhere.
    if (notes.size === 0 && incomeByOwner.size === 0) {
      return [];
    }

    // Union of cells that need to exist: configured notes, income-derived
    // tax-deferred cells, and any (owner, type) that receives contributions.
    const wanted = new Map<string, { ownerCode: string; type: TaxAdvantagedType }>();
    for (const [k, v] of notes) {
      wanted.set(k, { ownerCode: v.ownerCode, type: v.type });
    }
    for (const ownerCode of incomeByOwner.keys()) {
      wanted.set(`${ownerCode}::tax-deferred`, { ownerCode, type: 'tax-deferred' });
    }
    this.accounts.controls.forEach((a) => {
      const type = a.value.taxTreatment;
      const monthly = Number.parseFloat(a.value.monthlyContribution);
      if (
        (type !== 'tax-free' && type !== 'tax-deferred') ||
        Number.isNaN(monthly) ||
        monthly <= 0
      ) {
        return;
      }
      const ownerCode = this.ownerService.ownerCodeForAccountName(a.value.name);
      wanted.set(`${ownerCode}::${type}`, { ownerCode, type });
    });

    const cells: RoomCell[] = [];
    for (const { ownerCode, type } of wanted.values()) {
      const note = notes.get(`${ownerCode}::${type}`);
      const startingRoom = note?.limit ?? 0;
      let annualGrowth = note?.growth ?? 0;
      if (type === 'tax-deferred') {
        const income = incomeByOwner.get(ownerCode);
        if (income) {
          const earned = income * TAX_DEFERRED_INCOME_RATE;
          annualGrowth =
            note?.growth !== undefined ? Math.min(earned, note.growth) : earned;
        }
      }
      cells.push({ ownerCode, type, startingRoom, annualGrowth });
    }
    return cells;
  }

  // Highest income noted across each owner's accounts (income is a per-person
  // figure that may sit on any of that person's account notes).
  private incomeByOwner(): Map<string, number> {
    const map = new Map<string, number>();
    this.accounts.controls.forEach((a) => {
      const income = Number.parseFloat(a.value.income);
      if (Number.isNaN(income)) {
        return;
      }
      const ownerCode = this.ownerService.ownerCodeForAccountName(a.value.name);
      map.set(ownerCode, Math.max(map.get(ownerCode) ?? 0, income));
    });
    return map;
  }

  // Forward contribution streams: each contributing account becomes a
  // per-person, per-type stream (capped by its room cell). Typed category
  // contributions have no owner, so they enter as uncapped streams.
  private buildContributionStreams(): ContributionStream[] {
    const streams: ContributionStream[] = [];
    this.accounts.controls.forEach((a) => {
      const monthly = Number.parseFloat(a.value.monthlyContribution);
      const taxTreatment = a.value.taxTreatment;
      if (Number.isNaN(monthly) || monthly <= 0 || !taxTreatment) {
        return;
      }
      streams.push({
        ownerCode: this.ownerService.ownerCodeForAccountName(a.value.name),
        type: taxTreatment,
        annualContribution: monthly * 12,
      });
    });

    const categoryGroups = this.budgetForm.value.categoryGroups || [];
    categoryGroups.forEach((group) => {
      group.categories.forEach((category) => {
        this.pushCategoryStream(streams, 'tax-free', category.taxFreeContribution);
        this.pushCategoryStream(
          streams,
          'tax-deferred',
          category.taxDeferredContribution,
        );
        this.pushCategoryStream(streams, 'taxable', category.taxableContribution);
      });
    });
    return streams;
  }

  private pushCategoryStream(
    streams: ContributionStream[],
    type: ContributionTaxType,
    monthly: number,
  ): void {
    if (!monthly) {
      return;
    }
    streams.push({
      ownerCode: '__category__',
      type,
      annualContribution: monthly * 12,
    });
  }

  // Current account balances split by tax treatment — dollars already in each
  // wrapper, used to seed the terminal split.
  private getBalanceSplit(): {
    taxFree: number;
    taxDeferred: number;
    taxable: number;
  } {
    let taxFree = 0;
    let taxDeferred = 0;
    let taxable = 0;
    this.accounts.controls.forEach((a) => {
      const balance = Number.parseFloat(a.value.balance);
      if (Number.isNaN(balance) || balance <= 0) {
        return;
      }
      switch (a.value.taxTreatment) {
        case 'tax-free':
          taxFree += balance;
          break;
        case 'tax-deferred':
          taxDeferred += balance;
          break;
        case 'taxable':
          taxable += balance;
          break;
      }
    });
    return { taxFree, taxDeferred, taxable };
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
            roomLimit: overrides.roomLimit,
            roomGrowth: overrides.roomGrowth,
            income: overrides.income,
            takeHome: overrides.takeHome,
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
      inflationRate: this.inflationRate,
      contributionGrowthRate: this.contributionGrowthRate,
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
