export interface PrePayment {
  type: 'pre-payment';
  name: string;
  amount: number;
  frequency: 'one-time' | 'recurring';
  startDate: Date;
  endDate?: Date;
}
