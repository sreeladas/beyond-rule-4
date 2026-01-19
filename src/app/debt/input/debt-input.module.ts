import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SharedModule } from '../../shared.module';
import { DebtInputComponent } from './debt-input.component';

@NgModule({
  imports: [FormsModule, SharedModule],
  declarations: [DebtInputComponent],
  exports: [DebtInputComponent],
})
export class DebtInputModule {}
