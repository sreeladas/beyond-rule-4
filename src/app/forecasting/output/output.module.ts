import { NgModule } from '@angular/core';

import { SharedModule } from '../../shared.module';
import { ForecastingOutputComponent } from './output.component';
import { MilestonesModule } from './milestones/milestones.module';
import { FiTextModule } from './fi-text/fi-text.module';
import { ImpactModule } from './impact/impact.module';
import { FireDashboardComponent } from './fire-dashboard/fire-dashboard.component';

@NgModule({
  imports: [SharedModule, MilestonesModule, FiTextModule, ImpactModule],
  exports: [ForecastingOutputComponent],
  declarations: [ForecastingOutputComponent, FireDashboardComponent],
  providers: [],
})
export class OutputModule {}
