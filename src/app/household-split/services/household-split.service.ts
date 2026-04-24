import { Injectable } from '@angular/core';
import * as ynab from 'ynab';

import { OwnerService } from './owner.service';
import { GroupSplit, OwnerSpend } from '../models/household-split.model';

const NULL_GROUP_NAME = 'Uncategorized / Split';
const UNKNOWN_OWNER = 'Unknown';

@Injectable({ providedIn: 'root' })
export class HouseholdSplitService {
  constructor(private ownerService: OwnerService) {}

  compute(
    budget: ynab.BudgetDetail,
    selectedGroupIds: string[],
    sinceDate: Date,
    displayNames: Record<string, string>
  ): GroupSplit[] {
    const accountToOwner = this.ownerService.buildAccountOwnerMap(
      budget.accounts
    );

    const categoryToGroupId = new Map<string, string>();
    const groupNameById = new Map<string, string>();
    for (const g of budget.category_groups ?? []) {
      groupNameById.set(g.id, g.name);
      for (const c of g.categories ?? []) {
        categoryToGroupId.set(c.id, g.id);
      }
    }

    const selectedSet = new Set(selectedGroupIds);
    // bucketKey -> ownerCode -> sumMilliUnits
    const buckets = new Map<string, Map<string, number>>();
    const NULL_KEY = '__null__';

    for (const t of budget.transactions ?? []) {
      if (t.deleted) continue;
      if (t.transfer_account_id) continue;
      if (t.amount >= 0) continue;
      if (new Date(t.date) < sinceDate) continue;

      let bucketKey: string;
      if (t.category_id == null) {
        bucketKey = NULL_KEY;
      } else {
        const groupId = categoryToGroupId.get(t.category_id);
        if (!groupId || !selectedSet.has(groupId)) continue;
        bucketKey = groupId;
      }

      const ownerCode = accountToOwner.get(t.account_id) ?? UNKNOWN_OWNER;
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
          buckets.get(groupId) ?? new Map(),
          displayNames
        )
      );
    }
    result.push(
      this.toGroupSplit(
        null,
        NULL_GROUP_NAME,
        buckets.get(NULL_KEY) ?? new Map(),
        displayNames
      )
    );
    return result;
  }

  private toGroupSplit(
    groupId: string | null,
    groupName: string,
    ownerSums: Map<string, number>,
    displayNames: Record<string, string>
  ): GroupSplit {
    const totalMilli = [...ownerSums.values()].reduce((a, b) => a + b, 0);
    const byOwner: OwnerSpend[] = [];
    for (const [ownerCode, sumMilli] of ownerSums) {
      byOwner.push({
        ownerCode,
        displayName: displayNames[ownerCode] || ownerCode,
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
}
