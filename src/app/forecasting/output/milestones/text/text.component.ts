import { Component, OnInit, Input, OnChanges, SimpleChanges, } from '@angular/core';

import { CalculateInput } from '../../../models/calculate-input.model';
import { Forecast, MonthlyForecast } from '../../../models/forecast.model';
import { Milestones } from '../milestone.model';
import { birthdateToDate } from '../../../input/ynab/birthdate-utility';

@Component({
    selector: 'app-milestones-text',
    templateUrl: 'text.component.html',
    styleUrls: ['./text.component.css'],
    standalone: false
})

export class TextComponent implements OnInit, OnChanges {
  @Input() forecast: Forecast;
  @Input() milestones: Milestones;
  @Input() currencyIsoCode: string;

  milestonesWithForecast;

  private completeText = 'Achieved!';

  constructor() { }

  ngOnInit() {
    this.calculateData();
  }

  ngOnChanges(changes: SimpleChanges): void {
    this.calculateData();
  }

  calculateData() {
    if (!this.forecast || !this.milestones) {
      return;
    }
    const forecastSearch = this.forecast.monthlyForecasts;
    
    // Get regular milestones
    const milestonesSearch = this.milestones.milestones.sort((a, b) => {
      return a.value - b.value;
    });
    const foundForecasts = [];
    for (let i = 0; i < milestonesSearch.length; i++) {
      const milestone = milestonesSearch[i];
      const foundIndex = forecastSearch.findIndex(f => f.netWorth >= milestone.value);
      foundForecasts[i] = foundIndex;
    }
    
    // Create regular milestone entries
    const regularMilestones = milestonesSearch.map((milestone, i) => {
      const foundIndex = foundForecasts[i];
      if (foundIndex === -1) {
        return {
          milestone,
          forecast: null
        };
      }
      const forecast = forecastSearch[foundIndex];
      const forecastDate = this.getDateString(forecast.date);
      const distance = this.getDistanceText(forecast.date);
      const age = this.forecast.getDistanceFromDateText(forecast.date, birthdateToDate(this.forecast.birthdate));
      const completed = distance === this.completeText;
      return {
        milestone,
        forecast,
        forecastDate,
        distance,
        age,
        completed
      };
    });

    // Add Coast FI milestones
    const coastFiMilestones = this.getCoastFiMilestones(forecastSearch);
    
    // Combine and sort all milestones by net worth value
    this.milestonesWithForecast = [...regularMilestones, ...coastFiMilestones]
      .filter(m => m.milestone && m.milestone.value) // Remove any invalid entries
      .sort((a, b) => a.milestone.value - b.milestone.value);
  }

  private getCoastFiMilestones(forecastSearch: any[]) {
    const coastFiMilestones = [];
    
    // Find Coast FIRE (-5y) achievement
    const coastFireMinusFiveAchieved = forecastSearch.find(f => f.netWorth >= f.coastFireMinusFive);
    if (coastFireMinusFiveAchieved) {
      coastFiMilestones.push(this.createCoastFiMilestone(
        'Coast FIRE (-5y) Achieved',
        coastFireMinusFiveAchieved.coastFireMinusFive,
        coastFireMinusFiveAchieved
      ));
    }

    // Find Coast FIRE achievement
    const coastFireAchieved = forecastSearch.find(f => f.coastFireAchieved);
    if (coastFireAchieved) {
      coastFiMilestones.push(this.createCoastFiMilestone(
        'Coast FIRE Achieved',
        coastFireAchieved.coastFireNumber,
        coastFireAchieved
      ));
    }

    // Find Coast FIRE (+5y) achievement
    const coastFirePlusFiveAchieved = forecastSearch.find(f => f.netWorth >= f.coastFirePlusFive);
    if (coastFirePlusFiveAchieved) {
      coastFiMilestones.push(this.createCoastFiMilestone(
        'Coast FIRE (+5y) Achieved',
        coastFirePlusFiveAchieved.coastFirePlusFive,
        coastFirePlusFiveAchieved
      ));
    }

    return coastFiMilestones;
  }

  private createCoastFiMilestone(label: string, value: number, forecast: any) {
    const forecastDate = this.getDateString(forecast.date);
    const distance = this.getDistanceText(forecast.date);
    const age = this.forecast.getDistanceFromDateText(forecast.date, birthdateToDate(this.forecast.birthdate));
    const completed = distance === this.completeText;
    
    return {
      milestone: { label, value },
      forecast,
      forecastDate,
      distance,
      age,
      completed
    };
  }

  getDateString(forecastDate: Date) {
    if (!forecastDate) {
      return 'N/A';
    }

    const options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short' };
    return forecastDate.toLocaleDateString('en-US', options);
  }

  getDistanceText(forecastDate: Date) {
    return this.forecast.getDistanceFromFirstMonthText(forecastDate) ?? this.completeText;
  }
}
