import { Component, OnInit } from '@angular/core';
import * as ynab from 'ynab';

import { YnabApiService } from '../ynab-api/ynab-api.service';
import { OwnerService } from './services/owner.service';
import {
  HouseholdSplitService,
  DateRange,
} from './services/household-split.service';
import { GroupSplit, OwnerSpend } from './models/household-split.model';

const STORAGE_BUDGET_ID = 'ff-selected-budget';
const STORAGE_SELECTED_GROUPS = 'ff-household-split.selected-groups';
const STORAGE_FROM_MONTH = 'ff-household-split.from-month';
const STORAGE_TO_MONTH = 'ff-household-split.to-month';

const HIDDEN_GROUP_NAME_FRAGMENTS = ['internal master category'];
const MONTH_OPTION_COUNT = 4;

interface MonthOption {
  value: string;
  label: string;
}

interface PickerOption {
  id: string;
  name: string;
}

@Component({
  selector: 'app-household-split',
  templateUrl: 'household-split.component.html',
  standalone: false,
})
export class HouseholdSplitComponent implements OnInit {
  budgets: ynab.BudgetSummary[] = [];
  selectedBudgetId = '';
  isUsingSampleData = false;

  ownerOptions: string[] = [];
  selectedOwnerCodes: string[] = [];

  groupOptions: PickerOption[] = [];
  selectedGroupIds: string[] = [];

  monthOptions: MonthOption[] = [];
  fromMonth = '';
  toMonth = '';

  results: GroupSplit[] = [];

  private budget?: ynab.BudgetDetail;

  constructor(
    private ynabApi: YnabApiService,
    private ownerService: OwnerService,
    private splitService: HouseholdSplitService
  ) {}

  async ngOnInit() {
    this.isUsingSampleData = this.ynabApi.isUsingSampleData();
    this.selectedOwnerCodes = this.ownerService.loadSelectedOwnerCodes();
    this.selectedGroupIds = this.loadSelectedGroupIds();

    this.monthOptions = this.buildMonthOptions();
    const storedFrom = window.localStorage.getItem(STORAGE_FROM_MONTH);
    const storedTo = window.localStorage.getItem(STORAGE_TO_MONTH);
    const valid = new Set(this.monthOptions.map((m) => m.value));
    this.fromMonth =
      storedFrom && valid.has(storedFrom)
        ? storedFrom
        : this.monthOptions[0].value;
    this.toMonth =
      storedTo && valid.has(storedTo) ? storedTo : this.monthOptions[0].value;
    this.normalizeMonthRange();

    this.budgets = (await this.ynabApi.getBudgets()) ?? [];
    const storedBudgetId = window.localStorage.getItem(STORAGE_BUDGET_ID);
    if (storedBudgetId && this.budgets.some((b) => b.id === storedBudgetId)) {
      this.selectedBudgetId = storedBudgetId;
    } else if (this.budgets.length > 0) {
      this.selectedBudgetId = this.budgets[0].id;
    }
    if (this.selectedBudgetId) {
      await this.loadBudget();
    }
  }

  async onBudgetChange(budgetId: string) {
    this.selectedBudgetId = budgetId;
    window.localStorage.setItem(STORAGE_BUDGET_ID, budgetId);
    await this.loadBudget();
  }

  toggleOwner(code: string) {
    const i = this.selectedOwnerCodes.indexOf(code);
    if (i >= 0) this.selectedOwnerCodes.splice(i, 1);
    else this.selectedOwnerCodes.push(code);
    this.selectedOwnerCodes.sort();
    this.ownerService.saveSelectedOwnerCodes(this.selectedOwnerCodes);
    this.recompute();
  }

  isOwnerSelected(code: string): boolean {
    return this.selectedOwnerCodes.includes(code);
  }

  toggleGroup(id: string) {
    const i = this.selectedGroupIds.indexOf(id);
    if (i >= 0) this.selectedGroupIds.splice(i, 1);
    else this.selectedGroupIds.push(id);
    window.localStorage.setItem(
      STORAGE_SELECTED_GROUPS,
      JSON.stringify(this.selectedGroupIds)
    );
    this.recompute();
  }

  isGroupSelected(id: string): boolean {
    return this.selectedGroupIds.includes(id);
  }

  onFromMonthChange(value: string) {
    this.fromMonth = value;
    this.normalizeMonthRange();
    this.persistMonthRange();
    this.recompute();
  }

  onToMonthChange(value: string) {
    this.toMonth = value;
    this.normalizeMonthRange();
    this.persistMonthRange();
    this.recompute();
  }

  ownerSummary(): string {
    if (!this.selectedOwnerCodes.length) return 'Select owners';
    return this.selectedOwnerCodes.join(', ');
  }

  groupSummary(): string {
    if (!this.selectedGroupIds.length) return 'Select category groups';
    const names = this.groupOptions
      .filter((g) => this.selectedGroupIds.includes(g.id))
      .map((g) => g.name);
    if (names.length <= 3) return names.join(', ');
    return `${names.length} selected`;
  }

  getOwnerSpend(row: GroupSplit, ownerCode: string): OwnerSpend | undefined {
    return row.byOwner.find((o) => o.ownerCode === ownerCode);
  }

  hasResults(): boolean {
    return (
      this.selectedOwnerCodes.length > 0 &&
      this.results.some((r) => r.total > 0)
    );
  }

  private async loadBudget() {
    this.budget = await this.ynabApi.getBudgetById(this.selectedBudgetId);
    if (!this.budget) {
      this.ownerOptions = [];
      this.groupOptions = [];
      this.results = [];
      return;
    }

    this.ownerOptions = this.ownerService.distinctOwnerCodes(
      this.budget.accounts
    );
    this.selectedOwnerCodes = this.selectedOwnerCodes.filter((c) =>
      this.ownerOptions.includes(c)
    );

    this.groupOptions = (this.budget.category_groups ?? [])
      .filter((g) => !g.deleted && !g.hidden)
      .filter(
        (g) =>
          !HIDDEN_GROUP_NAME_FRAGMENTS.some((f) =>
            g.name.toLowerCase().includes(f)
          )
      )
      .map((g) => ({ id: g.id, name: g.name }));
    const validGroupIds = new Set(this.groupOptions.map((g) => g.id));
    this.selectedGroupIds = this.selectedGroupIds.filter((id) =>
      validGroupIds.has(id)
    );

    this.recompute();
  }

  private buildMonthOptions(): MonthOption[] {
    const now = new Date();
    const opts: MonthOption[] = [];
    for (let i = 0; i < MONTH_OPTION_COUNT; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      opts.push({
        value: this.monthValue(d),
        label: d.toLocaleString('en-US', { month: 'long', year: 'numeric' }),
      });
    }
    return opts;
  }

  private monthValue(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  private normalizeMonthRange() {
    if (this.compareMonth(this.fromMonth, this.toMonth) > 0) {
      this.toMonth = this.fromMonth;
    }
  }

  private compareMonth(a: string, b: string): number {
    return a.localeCompare(b);
  }

  private persistMonthRange() {
    window.localStorage.setItem(STORAGE_FROM_MONTH, this.fromMonth);
    window.localStorage.setItem(STORAGE_TO_MONTH, this.toMonth);
  }

  private currentRange(): DateRange {
    const [fy, fm] = this.fromMonth.split('-').map(Number);
    const [ty, tm] = this.toMonth.split('-').map(Number);
    return {
      since: new Date(fy, fm - 1, 1),
      until: new Date(ty, tm, 1),
    };
  }

  private loadSelectedGroupIds(): string[] {
    try {
      const raw = window.localStorage.getItem(STORAGE_SELECTED_GROUPS);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  private recompute() {
    if (!this.budget) {
      this.results = [];
      return;
    }
    this.results = this.splitService.compute(
      this.budget,
      this.selectedGroupIds,
      this.selectedOwnerCodes,
      this.currentRange()
    );
  }
}
