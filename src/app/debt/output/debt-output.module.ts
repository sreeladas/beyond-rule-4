import { NgModule } from '@angular/core';
import { NgxChartsModule } from '@swimlane/ngx-charts';
import { SharedModule } from '../../shared.module';
import { DebtOutputComponent } from './debt-output.component';

@NgModule({
  imports: [SharedModule, NgxChartsModule],
  declarations: [DebtOutputComponent],
  exports: [DebtOutputComponent],
})
export class DebtOutputModule {}
