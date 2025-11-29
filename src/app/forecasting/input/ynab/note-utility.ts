export type TaxTreatment = 'tax-free' | 'tax-deferred' | 'taxable';

export interface Overrides {
  contributionBudget: number;
  computedLeanFiBudget: number;
  computedFiBudget: number;
  monthlyContribution: number;
  taxTreatment: TaxTreatment;
  taxFreeContribution: number;
  taxDeferredContribution: number;
  taxableContribution: number;
}

export default class NoteUtility {
  public static getNoteOverrides(
    note: string,
    originalValue: number
  ): Overrides {
    const override = {
      contributionBudget: undefined,
      computedLeanFiBudget: undefined,
      computedFiBudget: undefined,
      monthlyContribution: undefined,
      taxTreatment: undefined,
      taxFreeContribution: undefined,
      taxDeferredContribution: undefined,
      taxableContribution: undefined,
    };

    if (!note) {
      return override;
    }

    const commands = this.getCommands(note, originalValue);

    commands.forEach((c) => {
      switch (c.key) {
        case '+':
        case 'c':
        case 'contribution':
          override.contributionBudget = c.value;
          break;
        case 'l':
        case 'lfi':
        case 'lean':
          override.computedLeanFiBudget = c.value;
          break;
        case 'f':
        case 'fi':
          override.computedFiBudget = c.value;
          break;
        case '+m':
          override.monthlyContribution = c.value;
          break;
        case '+tax-free':
        case '+taxfree':
        case '+tfsa':
        case '+roth':
          override.taxFreeContribution =
            (override.taxFreeContribution || 0) + c.value;
          break;
        case '+tax-deferred':
        case '+taxdeferred':
        case '+rrsp':
        case '+401k':
        case '+traditional':
          override.taxDeferredContribution =
            (override.taxDeferredContribution || 0) + c.value;
          break;
        case '+taxable':
        case '+investment':
        case '+brokerage':
          override.taxableContribution =
            (override.taxableContribution || 0) + c.value;
          break;
        case 'tax-free':
        case 'taxfree':
        case 'tfsa':
        case 'roth':
          override.taxTreatment = 'tax-free';
          break;
        case 'tax-deferred':
        case 'taxdeferred':
        case 'rrsp':
        case '401k':
        case 'traditional':
          override.taxTreatment = 'tax-deferred';
          break;
        case 'taxable':
        case 'investment':
        case 'brokerage':
          override.taxTreatment = 'taxable';
          break;
        default:
          break;
      }
    });

    return override;
  }

  private static getCommands(originalNote: string, originValue: number) {
    const note = originalNote.toLowerCase();
    const commandPrefix = 'br4';
    if (note.indexOf(commandPrefix) === -1) {
      return [];
    }

    const lines = note.split(commandPrefix);
    if (!lines || !lines.length) {
      return [];
    }

    return lines
      .map((line) => {
        const cleaned = line.replace(/\:/g, ' ').replace(/\s+/g, ' ').trim();
        const numRegex = /[+-]?\d+(?:\.\d+)?/g;
        const match = numRegex.exec(cleaned);
        if (!match || !match.length) {
          return {
            key: cleaned,
            value: originValue,
          };
        }
        const foundValue = match[0];
        const key = cleaned.substring(0, cleaned.indexOf(foundValue)).trim();
        const value = Number(foundValue);
        return {
          key,
          value,
        };
      })
      .filter((l) => l.key);
  }
}
