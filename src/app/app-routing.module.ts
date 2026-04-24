import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ForecastingComponent } from './forecasting/forecasting.component';
import { DebtComponent } from './debt/debt.component';
import { HouseholdSplitComponent } from './household-split/household-split.component';

const appRoutes: Routes = [
  { path: '', component: ForecastingComponent, pathMatch: 'full' },
  { path: 'debt', component: DebtComponent },
  { path: 'household-split', component: HouseholdSplitComponent },
  { path: '**', redirectTo: '' },
];

@NgModule({
  imports: [RouterModule.forRoot(appRoutes, {})],
  exports: [RouterModule],
  providers: [],
})
export class AppRoutingModule {}
