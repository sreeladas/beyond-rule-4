import { Injectable } from '@angular/core';
import * as ynab from 'ynab';

const STORAGE_OWNER_NAMES = 'ff-household-split.owner-names';
const UNKNOWN_OWNER = 'Unknown';

@Injectable({ providedIn: 'root' })
export class OwnerService {
  ownerCodeForAccountName(name: string): string {
    const token = (name ?? '').trim().split(/\s+/)[0];
    return token || UNKNOWN_OWNER;
  }

  buildAccountOwnerMap(accounts: ynab.Account[]): Map<string, string> {
    const map = new Map<string, string>();
    for (const a of accounts ?? []) {
      map.set(a.id, this.ownerCodeForAccountName(a.name));
    }
    return map;
  }

  distinctOwnerCodes(accounts: ynab.Account[]): string[] {
    const codes = new Set<string>();
    for (const a of accounts ?? []) {
      if (a.closed || a.deleted) continue;
      codes.add(this.ownerCodeForAccountName(a.name));
    }
    return [...codes].sort();
  }

  loadDisplayNames(): Record<string, string> {
    try {
      const raw = window.localStorage.getItem(STORAGE_OWNER_NAMES);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  saveDisplayNames(names: Record<string, string>): void {
    window.localStorage.setItem(STORAGE_OWNER_NAMES, JSON.stringify(names));
  }
}
