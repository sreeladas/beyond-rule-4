import { NgModule } from '@angular/core';

import { SharedModule } from '../../shared.module';
import { ForecastingOutputComponent } from './output.component';
import { MilestonesModule } from './milestones/milestones.module';
import { FiTextModule } from './fi-text/fi-text.module';
import { ImpactModule } from './impact/impact.module';
import { WindfallModule } from './windfall/windfall.module';
import { FireDashboardComponent } from './fire-dashboard/fire-dashboard.component';
import { ScenarioComparisonComponent } from './scenario-comparison/scenario-comparison.component';

@NgModule({
  imports: [
    SharedModule,
    MilestonesModule,
    FiTextModule,
    ImpactModule,
    WindfallModule,
  ],
  exports: [ForecastingOutputComponent],
  declarations: [
    ForecastingOutputComponent,
    FireDashboardComponent,
    ScenarioComparisonComponent,
  ],
  providers: [],
})
export class OutputModule {}
