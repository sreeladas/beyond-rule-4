import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { SharedModule } from '../../../shared.module';
import { WindfallComponent } from './windfall.component';

@NgModule({
  imports: [SharedModule, FormsModule],
  exports: [WindfallComponent],
  declarations: [WindfallComponent],
  providers: [],
})
export class WindfallModule {}
