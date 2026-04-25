import { Injectable } from '@angular/core';
import * as ynab from 'ynab';

import { OwnerService } from './owner.service';
import { GroupSplit, OwnerSpend } from '../models/household-split.model';

const NULL_GROUP_NAME = 'Uncategorized / Split';
const OVERALL_GROUP_NAME = 'Overall';
const UNKNOWN_OWNER = 'Unknown';
const NULL_KEY = '__null__';

export interface DateRange {
  since: Date;
  until: Date;
}

@Injectable({ providedIn: 'root' })
export class HouseholdSplitService {
  constructor(private ownerService: OwnerService) {}

  compute(
    budget: ynab.BudgetDetail,
    selectedGroupIds: string[],
    selectedOwnerCodes: string[],
    selectedAccountIds: string[],
    range: DateRange
  ): GroupSplit[] {
    const accountToOwner = this.ownerService.buildAccountOwnerMap(
      budget.accounts
    );
    const ownerSet = new Set(selectedOwnerCodes);
    const accountSet = new Set(selectedAccountIds);

    const groupNameById = new Map<string, string>();
    for (const g of budget.category_groups ?? []) {
      groupNameById.set(g.id, g.name);
    }
    const categoryToGroupId = new Map<string, string>();
    for (const c of budget.categories ?? []) {
      categoryToGroupId.set(c.id, c.category_group_id);
    }

    const transferPayeeIds = new Set<string>();
    for (const p of budget.payees ?? []) {
      if (p.transfer_account_id) transferPayeeIds.add(p.id);
    }

    const selectedGroupSet = new Set(selectedGroupIds);
    const buckets = new Map<string, Map<string, number>>();

    for (const t of budget.transactions ?? []) {
      if (t.deleted) continue;
      if (t.transfer_account_id) continue;
      if (t.payee_id && transferPayeeIds.has(t.payee_id)) continue;
      if (t.amount >= 0) continue;
      if (!accountSet.has(t.account_id)) continue;
      const txDate = new Date(t.date);
      if (txDate < range.since || txDate >= range.until) continue;

      let bucketKey: string;
      if (t.category_id == null) {
        bucketKey = NULL_KEY;
      } else {
        const groupId = categoryToGroupId.get(t.category_id);
        if (!groupId || !selectedGroupSet.has(groupId)) continue;
        bucketKey = groupId;
      }

      const ownerCode = accountToOwner.get(t.account_id) ?? UNKNOWN_OWNER;
      if (!ownerSet.has(ownerCode)) continue;

      let inner = buckets.get(bucketKey);
      if (!inner) {
        inner = new Map();
        buckets.set(bucketKey, inner);
      }
      inner.set(ownerCode, (inner.get(ownerCode) ?? 0) + Math.abs(t.amount));
    }

    const result: GroupSplit[] = [];
    for (const groupId of selectedGroupIds) {
      result.push(
        this.toGroupSplit(
          groupId,
          groupNameById.get(groupId) ?? '?',
          buckets.get(groupId) ?? new Map()
        )
      );
    }
    result.push(
      this.toGroupSplit(null, NULL_GROUP_NAME, buckets.get(NULL_KEY) ?? new Map())
    );
    result.push(this.computeOverall(result, selectedOwnerCodes));
    return result;
  }

  private toGroupSplit(
    groupId: string | null,
    groupName: string,
    ownerSums: Map<string, number>
  ): GroupSplit {
    const totalMilli = [...ownerSums.values()].reduce((a, b) => a + b, 0);
    const byOwner: OwnerSpend[] = [];
    for (const [ownerCode, sumMilli] of ownerSums) {
      byOwner.push({
        ownerCode,
        amount: ynab.utils.convertMilliUnitsToCurrencyAmount(sumMilli),
        percent: totalMilli === 0 ? 0 : (sumMilli / totalMilli) * 100,
      });
    }
    byOwner.sort((a, b) => a.ownerCode.localeCompare(b.ownerCode));
    return {
      groupId,
      groupName,
      total: ynab.utils.convertMilliUnitsToCurrencyAmount(totalMilli),
      byOwner,
    };
  }

  private computeOverall(
    rows: GroupSplit[],
    selectedOwnerCodes: string[]
  ): GroupSplit {
    const sums = new Map<string, number>();
    let total = 0;
    for (const row of rows) {
      if (row.groupId === null) continue;
      for (const o of row.byOwner) {
        sums.set(o.ownerCode, (sums.get(o.ownerCode) ?? 0) + o.amount);
        total += o.amount;
      }
    }
    const byOwner: OwnerSpend[] = selectedOwnerCodes.map((code) => {
      const amount = sums.get(code) ?? 0;
      return {
        ownerCode: code,
        amount,
        percent: total === 0 ? 0 : (amount / total) * 100,
      };
    });
    return {
      groupId: '__overall__',
      groupName: OVERALL_GROUP_NAME,
      total,
      byOwner,
      isOverall: true,
    };
  }
}
