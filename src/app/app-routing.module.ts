import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ForecastingComponent } from './forecasting/forecasting.component';
import { DebtComponent } from './debt/debt.component';

const appRoutes: Routes = [
  { path: '', component: ForecastingComponent, pathMatch: 'full' },
  { path: 'debt', component: DebtComponent },
  { path: '**', redirectTo: '' },
];

@NgModule({
  imports: [RouterModule.forRoot(appRoutes, {})],
  exports: [RouterModule],
  providers: [],
})
export class AppRoutingModule {}
