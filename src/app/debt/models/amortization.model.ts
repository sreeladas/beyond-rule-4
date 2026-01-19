export interface PaymentRow {
  paymentNumber: number;
  date: Date;
  minimumPayment: number;
  scheduledPayment: number;
  principal: number;
  interest: number;
  oneTimeExtra: number;
  balance: number;
}

export interface YearlySummary {
  year: number;
  totalPayments: number;
  totalPrincipal: number;
  totalInterest: number;
  totalExtra: number;
  endingBalance: number;
}

export interface AmortizationResult {
  schedule: PaymentRow[];
  yearlySummary: YearlySummary[];
  totalPayments: number;
  totalInterest: number;
  payoffDate: Date;
  payoffMonths: number;
}
