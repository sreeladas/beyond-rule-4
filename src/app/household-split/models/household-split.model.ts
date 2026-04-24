export interface OwnerSpend {
  ownerCode: string;
  displayName: string;
  amount: number;
  percent: number;
}

export interface GroupSplit {
  groupId: string | null;
  groupName: string;
  total: number;
  byOwner: OwnerSpend[];
}
