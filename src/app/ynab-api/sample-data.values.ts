import * as ynab from 'ynab';
import { YnabSampleData } from './sample-data.model';

const sampleBudgets: ynab.BudgetSummary[] = [
  {
    id: 'b0000000-0000-4000-a000-000000000001',
    name: 'Sample Budget',
  },
];

const sampleAccounts: ynab.Account[] = [
  {
    id: 'a0000000-0000-4000-a000-000000000001',
    name: 'Retirement Savings',
    type: ynab.AccountType.OtherAsset,
    on_budget: false,
    closed: false,
    note: '7%',
    balance: 15000000,
    cleared_balance: 15000000,
    uncleared_balance: 0,
    deleted: false,
    transfer_payee_id: 'p0000000-0000-4000-a000-000000000001',
  },
  {
    id: 'a0000000-0000-4000-a000-000000000002',
    name: 'Checking',
    type: ynab.AccountType.Checking,
    on_budget: true,
    closed: false,
    note: null,
    balance: 3000000,
    cleared_balance: 3000000,
    uncleared_balance: 0,
    deleted: false,
    transfer_payee_id: 'p0000000-0000-4000-a000-000000000002',
  },
  {
    id: 'a0000000-0000-4000-a000-000000000003',
    name: 'Savings',
    type: ynab.AccountType.Savings,
    on_budget: true,
    closed: false,
    note: null,
    balance: 5000000,
    cleared_balance: 5000000,
    uncleared_balance: 0,
    deleted: false,
    transfer_payee_id: 'p0000000-0000-4000-a000-000000000003',
  },
];

const GRP_HOUSING = 'g0000000-0000-4000-a000-000000000001';
const GRP_IMMEDIATE = 'g0000000-0000-4000-a000-000000000002';
const GRP_TRANSPORT = 'g0000000-0000-4000-a000-000000000003';
const GRP_TRUE_EXP = 'g0000000-0000-4000-a000-000000000004';
const GRP_QOL = 'g0000000-0000-4000-a000-000000000005';
const GRP_FI = 'g0000000-0000-4000-a000-000000000006';
const GRP_FUN = 'g0000000-0000-4000-a000-000000000007';

const CAT_RENT = 'c0000000-0000-4000-a000-000000000001';
const CAT_GROCERIES = 'c0000000-0000-4000-a000-000000000002';
const CAT_ELECTRIC = 'c0000000-0000-4000-a000-000000000003';
const CAT_INTERNET = 'c0000000-0000-4000-a000-000000000004';
const CAT_PHONE = 'c0000000-0000-4000-a000-000000000005';
const CAT_TRANSPORT = 'c0000000-0000-4000-a000-000000000006';
const CAT_AUTO_INS = 'c0000000-0000-4000-a000-000000000007';
const CAT_MEDICAL = 'c0000000-0000-4000-a000-000000000008';
const CAT_CLOTHING = 'c0000000-0000-4000-a000-000000000009';
const CAT_DINING = 'c0000000-0000-4000-a000-00000000000a';
const CAT_VACATION = 'c0000000-0000-4000-a000-00000000000b';
const CAT_RETIRE_SAVE = 'c0000000-0000-4000-a000-00000000000c';
const CAT_EMERGENCY = 'c0000000-0000-4000-a000-00000000000d';
const CAT_FUN = 'c0000000-0000-4000-a000-00000000000e';

function cat(
  id: string,
  groupId: string,
  name: string,
  budgeted: number,
  activity: number,
  note: string = null,
): any {
  return {
    id: id,
    category_group_id: groupId,
    name: name,
    hidden: false,
    note: note,
    budgeted: budgeted,
    activity: activity,
    balance: budgeted + activity,
    deleted: false,
  };
}

const allCategories = [
  cat(CAT_RENT, GRP_HOUSING, 'Rent', 1400000, -1400000),
  cat(CAT_GROCERIES, GRP_IMMEDIATE, 'Groceries', 400000, -380000),
  cat(CAT_ELECTRIC, GRP_IMMEDIATE, 'Electric', 80000, -75000),
  cat(CAT_INTERNET, GRP_IMMEDIATE, 'Internet', 60000, -60000),
  cat(CAT_PHONE, GRP_IMMEDIATE, 'Phone', 50000, -50000),
  cat(CAT_TRANSPORT, GRP_TRANSPORT, 'Transportation', 150000, -130000),
  cat(CAT_AUTO_INS, GRP_TRANSPORT, 'Auto Insurance', 120000, -120000),
  cat(CAT_MEDICAL, GRP_TRUE_EXP, 'Medical', 50000, -40000),
  cat(CAT_CLOTHING, GRP_TRUE_EXP, 'Clothing', 30000, 0),
  cat(CAT_DINING, GRP_QOL, 'Dining Out', 150000, -130000),
  cat(CAT_VACATION, GRP_QOL, 'Vacation', 100000, 0),
  cat(CAT_RETIRE_SAVE, GRP_FI, 'Retirement Savings', 300000, -300000),
  cat(CAT_EMERGENCY, GRP_FI, 'Emergency Fund', 100000, -100000),
  cat(CAT_FUN, GRP_FUN, 'Fun Money', 200000, -150000),
];

const sampleMonth: ynab.MonthDetail = {
  month: '2026-01-01',
  note: null,
  to_be_budgeted: 0,
  age_of_money: 30,
  income: 0,
  budgeted: 0,
  activity: 0,
  deleted: false,
  categories: allCategories,
};

const sampleMonths: ynab.MonthSummary[] = [
  Object.assign(
    {
      month: '2026-01-01',
      note: null,
      to_be_budgeted: 0,
      age_of_money: 30,
    },
    sampleMonth,
  ),
];

function group(
  id: string,
  name: string,
  cats: any[],
): ynab.CategoryGroupWithCategories {
  return {
    id: id,
    name: name,
    hidden: false,
    deleted: false,
    categories: cats.filter((c) => c.category_group_id === id),
  };
}

const sampleCategoryGroupsWithCategories: ynab.CategoryGroupWithCategories[] = [
  group(GRP_HOUSING, 'Housing', allCategories),
  group(GRP_IMMEDIATE, 'Immediate Obligations', allCategories),
  group(GRP_TRANSPORT, 'Transportation', allCategories),
  group(GRP_TRUE_EXP, 'True Expenses', allCategories),
  group(GRP_QOL, 'Quality of Life Goals', allCategories),
  group(GRP_FI, 'Financial Independence', allCategories),
  group(GRP_FUN, 'Just for Fun', allCategories),
];

const sampleBudget: ynab.BudgetDetail = {
  id: 'b0000000-0000-4000-a000-000000000001',
  name: 'Sample Budget',
  accounts: sampleAccounts,
  months: sampleMonths as ynab.MonthDetail[],
};

export const SampleData: YnabSampleData = {
  Budget: sampleBudget,
  Budgets: sampleBudgets,
  Accounts: sampleAccounts,
  Months: sampleMonths,
  Month: sampleMonth,
  CategoryGroupsWithCategories: sampleCategoryGroupsWithCategories,
};
