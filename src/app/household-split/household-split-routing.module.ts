import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { HouseholdSplitComponent } from './household-split.component';

const routes: Routes = [
  { path: 'household-split', component: HouseholdSplitComponent },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class HouseholdSplitRoutingModule {}
