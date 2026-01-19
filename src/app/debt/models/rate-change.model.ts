export interface RateChange {
  type: 'rate-change';
  name: string;
  rate: number; // As percentage (e.g., 5.25 for 5.25%)
  effectiveDate: Date;
}
