import { NgModule } from '@angular/core';
import { SharedModule } from '../shared.module';
import { DebtRoutingModule } from './debt-routing.module';
import { DebtInputModule } from './input/debt-input.module';
import { DebtOutputModule } from './output/debt-output.module';
import { DebtComponent } from './debt.component';

@NgModule({
  imports: [SharedModule, DebtRoutingModule, DebtInputModule, DebtOutputModule],
  declarations: [DebtComponent],
  exports: [DebtComponent],
})
export class DebtModule {}
