import { Component, OnInit } from '@angular/core';
import * as ynab from 'ynab';

import { YnabApiService } from '../ynab-api/ynab-api.service';
import { OwnerService } from './services/owner.service';
import { HouseholdSplitService } from './services/household-split.service';
import { GroupSplit, OwnerSpend } from './models/household-split.model';

const STORAGE_BUDGET_ID = 'ff-selected-budget';
const STORAGE_SELECTED_GROUPS = 'ff-household-split.selected-groups';
const STORAGE_DAYS = 'ff-household-split.days';

const HIDDEN_GROUP_NAME_FRAGMENTS = ['internal master category'];

interface GroupOption {
  id: string;
  name: string;
  selected: boolean;
}

type DaysOption = 30 | 60 | 90;

@Component({
  selector: 'app-household-split',
  templateUrl: 'household-split.component.html',
  standalone: false,
})
export class HouseholdSplitComponent implements OnInit {
  budgets: ynab.BudgetSummary[] = [];
  selectedBudgetId = '';
  isUsingSampleData = false;

  ownerCodes: string[] = [];
  ownerNames: Record<string, string> = {};

  groupOptions: GroupOption[] = [];

  daysOptions: DaysOption[] = [30, 60, 90];
  days: DaysOption = 30;

  results: GroupSplit[] = [];

  private budget?: ynab.BudgetDetail;

  constructor(
    private ynabApi: YnabApiService,
    private ownerService: OwnerService,
    private splitService: HouseholdSplitService
  ) {}

  async ngOnInit() {
    this.isUsingSampleData = this.ynabApi.isUsingSampleData();
    this.ownerNames = this.ownerService.loadDisplayNames();

    const storedDays = window.localStorage.getItem(STORAGE_DAYS);
    if (storedDays && this.daysOptions.includes(+storedDays as DaysOption)) {
      this.days = +storedDays as DaysOption;
    }

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

  onDaysChange(days: DaysOption) {
    this.days = days;
    window.localStorage.setItem(STORAGE_DAYS, String(days));
    this.recompute();
  }

  onOwnerNameChange() {
    this.ownerService.saveDisplayNames(this.ownerNames);
    this.recompute();
  }

  onGroupToggle() {
    const selected = this.groupOptions
      .filter((o) => o.selected)
      .map((o) => o.id);
    window.localStorage.setItem(
      STORAGE_SELECTED_GROUPS,
      JSON.stringify(selected)
    );
    this.recompute();
  }

  getOwnerSpend(row: GroupSplit, ownerCode: string): OwnerSpend | undefined {
    return row.byOwner.find((o) => o.ownerCode === ownerCode);
  }

  hasResults(): boolean {
    return this.results.some((r) => r.total > 0);
  }

  private async loadBudget() {
    this.budget = await this.ynabApi.getBudgetById(this.selectedBudgetId);
    if (!this.budget) {
      this.ownerCodes = [];
      this.groupOptions = [];
      this.results = [];
      return;
    }

    this.ownerCodes = this.ownerService.distinctOwnerCodes(
      this.budget.accounts
    );
    for (const code of this.ownerCodes) {
      if (!(code in this.ownerNames)) {
        this.ownerNames[code] = code;
      }
    }
    this.ownerService.saveDisplayNames(this.ownerNames);

    const previouslySelected = this.loadSelectedGroupIds();
    this.groupOptions = (this.budget.category_groups ?? [])
      .filter((g) => !g.deleted && !g.hidden)
      .filter(
        (g) =>
          !HIDDEN_GROUP_NAME_FRAGMENTS.some((f) =>
            g.name.toLowerCase().includes(f)
          )
      )
      .map((g) => ({
        id: g.id,
        name: g.name,
        selected: previouslySelected.has(g.id),
      }));

    this.recompute();
  }

  private loadSelectedGroupIds(): Set<string> {
    try {
      const raw = window.localStorage.getItem(STORAGE_SELECTED_GROUPS);
      return new Set<string>(raw ? JSON.parse(raw) : []);
    } catch {
      return new Set();
    }
  }

  private recompute() {
    if (!this.budget) {
      this.results = [];
      return;
    }
    const since = new Date();
    since.setDate(since.getDate() - this.days);
    const selectedIds = this.groupOptions
      .filter((o) => o.selected)
      .map((o) => o.id);
    this.results = this.splitService.compute(
      this.budget,
      selectedIds,
      since,
      this.ownerNames
    );
  }
}
