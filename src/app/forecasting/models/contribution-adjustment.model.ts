export interface ContributionAdjustment {
  name: string;
  startDate: Date;
  monthlyAdjustment: number;
}

export class ContributionAdjustmentUtility {
  public static getAdjustmentForMonth(
    adjustments: ContributionAdjustment[],
    forecastDate: Date
  ): number {
    if (!adjustments || adjustments.length === 0) {
      return 0;
    }

    let totalAdjustment = 0;
    adjustments.forEach((adjustment) => {
      if (forecastDate >= adjustment.startDate) {
        totalAdjustment += adjustment.monthlyAdjustment;
      }
    });

    return totalAdjustment;
  }

  public static sortAdjustments(
    adjustments: ContributionAdjustment[]
  ): ContributionAdjustment[] {
    return adjustments.sort(
      (a, b) => a.startDate.getTime() - b.startDate.getTime()
    );
  }
}
