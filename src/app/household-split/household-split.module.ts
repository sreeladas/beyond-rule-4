import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { SharedModule } from '../shared.module';
import { HouseholdSplitRoutingModule } from './household-split-routing.module';
import { HouseholdSplitComponent } from './household-split.component';

@NgModule({
  imports: [FormsModule, SharedModule, HouseholdSplitRoutingModule],
  declarations: [HouseholdSplitComponent],
  exports: [HouseholdSplitComponent],
})
export class HouseholdSplitModule {}
