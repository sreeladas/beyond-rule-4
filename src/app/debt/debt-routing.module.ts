import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { DebtComponent } from './debt.component';

const routes: Routes = [{ path: 'debt', component: DebtComponent }];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class DebtRoutingModule {}
