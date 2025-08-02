import {
  Component,
  OnInit,
  ViewEncapsulation,
  Input,
  OnChanges,
  SimpleChanges,
  AfterContentInit,
  ElementRef,
  ViewChild,
  HostListener,
  Inject,
  LOCALE_ID,
} from '@angular/core';

import { Forecast } from '../../../models/forecast.model';
import { Milestones } from '../milestone.model';
import { CalculateInput } from '../../../models/calculate-input.model';

declare let d3: any;

@Component({
  selector: 'app-milestones-chart',
  templateUrl: './chart.component.html',
  styleUrls: ['./chart.component.css'],
  encapsulation: ViewEncapsulation.None,
  standalone: false,
})
export class ChartComponent implements OnInit, AfterContentInit, OnChanges {
  @ViewChild('chartContainer') elementView: ElementRef;

  constructor(@Inject(LOCALE_ID) private locale: string) {}

  data: any[];

  view: any[];

  // options
  showXAxis = true;
  showYAxis = true;
  gradient = true;
  showLegend = true;
  showXAxisLabel = true;
  timeline = false;
  xAxisLabel = 'Date';
  showYAxisLabel = true;
  yAxisLabel = 'Net Worth';
  referenceLines: any[];
  public yAxisTickFormattingFn = this.yAxisTickFormatting.bind(this);

  colorScheme = {
    domain: [
      'hsl(210, 100%, 39%)', // brand-600 for Portfolio
      '#A10A28', // red for Contributions
      '#C7B42C', // gold for Returns
      '#e15759', // red for FIRE Number
      'hsl(140, 64%, 43%)', // jade green for Coast FIRE
      'hsl(140, 54%, 33%)', // darker jade for Coast FIRE +5y
      'hsl(140, 74%, 53%)', // lighter jade for Coast FIRE -5y
    ],
  };

  // line, area
  autoScale = true;

  @Input() forecast: Forecast;
  @Input() milestones: Milestones;
  @Input() currencyIsoCode: string;
  @Input() calculateInput: CalculateInput;

  private dateNow: Date;

  ngOnInit() {
    this.calculateData();
    this.dateNow = new Date();
  }

  @HostListener('window:resize', ['$event'])
  onResize(event) {
    this.setViewDimensions();
  }

  ngAfterContentInit() {
    this.setViewDimensions();
  }

  ngOnChanges(changes: SimpleChanges): void {
    this.calculateData();
  }

  onSelect($event) {}

  setViewDimensions() {
    if (!this.elementView) {
      return;
    }
    this.view = [
      this.elementView.nativeElement.offsetWidth,
      this.elementView.nativeElement.offsetHeight,
    ];
  }

  getToolTipDate(tooltipItem: any) {
    const forecastDate: Date = tooltipItem.name;
    const options: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: 'short',
    };
    const date = forecastDate.toLocaleDateString(this.locale, options);
    const distance = this.forecast.getDistanceFromFirstMonthText(forecastDate);
    if (!distance) {
      return date;
    }
    return `${date} • ${distance}`;
  }

  getToolTipText(tooltipItem: any): string {
    let result = '';
    if (tooltipItem.series !== undefined) {
      result += tooltipItem.series;
    } else {
      result += '???';
    }
    result += ': ';
    if (tooltipItem.value !== undefined) {
      result += this.formatCurrency(tooltipItem.value);
    }
    return result;
  }

  yAxisTickFormatting(val: number): string {
    return this.formatCurrency(val);
  }

  private calculateData() {
    if (!this.forecast || !this.milestones) {
      return;
    }

    const milestones = this.milestones.milestones.map((milestone) => {
      return {
        name: milestone.label,
        value: milestone.value,
      };
    });

    const netWorth = this.forecast.monthlyForecasts.map((monthForecast) => {
      return {
        name: monthForecast.date,
        value: monthForecast.netWorth,
      };
    });

    const contributions = this.forecast.monthlyForecasts.map(
      (monthForecast) => {
        return {
          name: monthForecast.date,
          value: monthForecast.totalContributions,
        };
      }
    );

    const returns = this.forecast.monthlyForecasts.map((monthForecast) => {
      return {
        name: monthForecast.date,
        value: monthForecast.totalReturns,
      };
    });

    // Build the data series array
    this.data = [
      {
        name: 'Portfolio',
        series: netWorth,
      },
      {
        name: 'Contributions',
        series: contributions,
      },
      {
        name: 'Returns',
        series: returns,
      },
    ];

    // Add Coast FIRE data if available
    if (this.calculateInput && this.forecast.monthlyForecasts.length > 0) {
      // FIRE Number line
      const fireNumberLine = this.forecast.monthlyForecasts.map(
        (monthForecast) => {
          return {
            name: monthForecast.date,
            value: this.calculateInput.fiNumber,
          };
        }
      );

      // Coast FIRE lines
      const coastFireLine = this.forecast.monthlyForecasts.map(
        (monthForecast) => {
          return {
            name: monthForecast.date,
            value: monthForecast.coastFireNumber,
          };
        }
      );

      const coastFirePlusFiveLine = this.forecast.monthlyForecasts.map(
        (monthForecast) => {
          return {
            name: monthForecast.date,
            value: monthForecast.coastFirePlusFive,
          };
        }
      );

      const coastFireMinusFiveLine = this.forecast.monthlyForecasts.map(
        (monthForecast) => {
          return {
            name: monthForecast.date,
            value: monthForecast.coastFireMinusFive,
          };
        }
      );

      // Add Coast FIRE data series
      this.data.push(
        {
          name: 'FIRE Number',
          series: fireNumberLine,
        },
        {
          name: 'Coast FIRE (-5y)',
          series: coastFireMinusFiveLine,
        },
        {
          name: 'Coast FIRE',
          series: coastFireLine,
        },
        {
          name: 'Coast FIRE (+5y)',
          series: coastFirePlusFiveLine,
        }
      );

      // Add Coast FIRE achievement reference lines
      const coastFireAchieved = this.forecast.monthlyForecasts.find(
        (f) => f.coastFireAchieved
      );
      const fireAchieved = this.forecast.monthlyForecasts.find(
        (f) => f.fireAchieved
      );
      const coastFireMinusFiveAchieved = this.forecast.monthlyForecasts.find(
        (f) => f.netWorth >= f.coastFireMinusFive
      );
      const coastFirePlusFiveAchieved = this.forecast.monthlyForecasts.find(
        (f) => f.netWorth >= f.coastFirePlusFive
      );

      if (coastFirePlusFiveAchieved) {
        milestones.push({
          name: 'Coast FIRE (+5y) Achieved',
          value: coastFirePlusFiveAchieved.coastFirePlusFive,
        });
      }

      if (coastFireAchieved) {
        milestones.push({
          name: 'Coast FIRE Achieved',
          value: coastFireAchieved.coastFireNumber,
        });
      }

      if (coastFireMinusFiveAchieved) {
        milestones.push({
          name: 'Coast FIRE (-5y) Achieved',
          value: coastFireMinusFiveAchieved.coastFireMinusFive,
        });
      }

      if (fireAchieved) {
        milestones.push({
          name: 'FIRE Achieved',
          value: fireAchieved.netWorth,
        });
      }
    }

    this.referenceLines = milestones;
  }

  private formatCurrency(val: number): string {
    return Intl.NumberFormat(this.locale, {
      style: 'currency',
      currency: this.currencyIsoCode,
    }).format(val);
  }
}
