import { Component } from '@angular/core';
import { DebtInput } from './models/debt-input.model';
import { Adjustment } from './input/debt-input.component';

@Component({
  selector: 'app-debt',
  templateUrl: 'debt.component.html',
  standalone: false,
})
export class DebtComponent {
  debtInput: DebtInput;
  adjustments: Adjustment[] = [];

  onDebtInputChange(input: DebtInput) {
    this.debtInput = input;
  }

  onAdjustmentsChange(adjustments: Adjustment[]) {
    this.adjustments = [...adjustments]; // triggers ngOnChanges
  }
}
