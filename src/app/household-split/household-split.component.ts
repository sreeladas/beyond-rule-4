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
const STORAGE_SELECTED_ACCOUNTS = 'ff-household-split.selected-accounts';
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

interface AccountGroup {
  typeLabel: string;
  accounts: PickerOption[];
}

function formatAccountType(type: string): string {
  if (!type) return 'Other';
  const spaced = type.replace(/([A-Z])/g, ' $1').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
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

  accountGroups: AccountGroup[] = [];
  totalAccountCount = 0;
  selectedAccountIds: string[] = [];

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
    this.selectedGroupIds = this.loadIdList(STORAGE_SELECTED_GROUPS);
    this.selectedAccountIds = this.loadIdList(STORAGE_SELECTED_ACCOUNTS);

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
    this.toggleId(this.selectedGroupIds, id, STORAGE_SELECTED_GROUPS);
    this.recompute();
  }

  isGroupSelected(id: string): boolean {
    return this.selectedGroupIds.includes(id);
  }

  toggleAccount(id: string) {
    this.toggleId(this.selectedAccountIds, id, STORAGE_SELECTED_ACCOUNTS);
    this.recompute();
  }

  isAccountSelected(id: string): boolean {
    return this.selectedAccountIds.includes(id);
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
    return this.summarize(this.selectedGroupIds, this.groupOptions, 'category groups');
  }

  accountSummary(): string {
    if (
      this.totalAccountCount > 0 &&
      this.selectedAccountIds.length === this.totalAccountCount
    ) {
      return 'All accounts';
    }
    if (!this.selectedAccountIds.length) return 'Select accounts';
    if (this.selectedAccountIds.length <= 3) {
      const names = this.flatAccountOptions()
        .filter((a) => this.selectedAccountIds.includes(a.id))
        .map((a) => a.name);
      return names.join(', ');
    }
    return `${this.selectedAccountIds.length} of ${this.totalAccountCount} selected`;
  }

  private flatAccountOptions(): PickerOption[] {
    return this.accountGroups.flatMap((g) => g.accounts);
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

  private summarize(
    selected: string[],
    options: PickerOption[],
    noun: string
  ): string {
    if (!selected.length) return `Select ${noun}`;
    const names = options
      .filter((o) => selected.includes(o.id))
      .map((o) => o.name);
    if (names.length <= 3) return names.join(', ');
    return `${names.length} selected`;
  }

  private toggleId(list: string[], id: string, storageKey: string) {
    const i = list.indexOf(id);
    if (i >= 0) list.splice(i, 1);
    else list.push(id);
    window.localStorage.setItem(storageKey, JSON.stringify(list));
  }

  private async loadBudget() {
    this.budget = await this.ynabApi.getBudgetById(this.selectedBudgetId);
    if (!this.budget) {
      this.ownerOptions = [];
      this.groupOptions = [];
      this.accountGroups = [];
      this.totalAccountCount = 0;
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

    this.accountGroups = this.buildAccountGroups(this.budget.accounts);
    this.totalAccountCount = this.accountGroups.reduce(
      (sum, g) => sum + g.accounts.length,
      0
    );
    const validAccountIds = new Set(
      this.flatAccountOptions().map((a) => a.id)
    );
    const filteredStoredAccounts = this.selectedAccountIds.filter((id) =>
      validAccountIds.has(id)
    );
    if (
      this.selectedAccountIds.length === 0 ||
      filteredStoredAccounts.length === 0
    ) {
      this.selectedAccountIds = this.flatAccountOptions().map((a) => a.id);
      window.localStorage.setItem(
        STORAGE_SELECTED_ACCOUNTS,
        JSON.stringify(this.selectedAccountIds)
      );
    } else {
      this.selectedAccountIds = filteredStoredAccounts;
    }

    this.recompute();
  }

  private buildAccountGroups(accounts: ynab.Account[]): AccountGroup[] {
    const byType = new Map<string, PickerOption[]>();
    for (const a of accounts ?? []) {
      if (a.closed || a.deleted) continue;
      const list = byType.get(a.type) ?? [];
      list.push({ id: a.id, name: a.name });
      byType.set(a.type, list);
    }
    const groups: AccountGroup[] = [];
    for (const [type, list] of byType) {
      list.sort((a, b) => a.name.localeCompare(b.name));
      groups.push({ typeLabel: formatAccountType(type), accounts: list });
    }
    groups.sort((a, b) => a.typeLabel.localeCompare(b.typeLabel));
    return groups;
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
    if (this.fromMonth.localeCompare(this.toMonth) > 0) {
      this.toMonth = this.fromMonth;
    }
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

  private loadIdList(key: string): string[] {
    try {
      const raw = window.localStorage.getItem(key);
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
      this.selectedAccountIds,
      this.currentRange()
    );
  }
}
