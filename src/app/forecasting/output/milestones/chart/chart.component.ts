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
  filteredData: any[];
  hiddenSeries: Set<string> = new Set([
    'Contributions',
    'Returns',
    'Coast FIRE (+5y)',
    'Coast FIRE (-5y)',
  ]);

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

  // Static color mapping by series name
  private seriesColorMap = new Map([
    ['Portfolio', 'hsl(210, 100%, 39%)'], // brand-600 for Portfolio
    ['Contributions', '#A10A28'], // red for Contributions
    ['Returns', '#C7B42C'], // gold for Returns
    ['FIRE Number', '#e15759'], // red for FIRE Number
    ['Coast FIRE', 'hsl(140, 64%, 43%)'], // jade green for Coast FIRE
    ['Coast FIRE (+5y)', 'hsl(140, 54%, 33%)'], // darker jade for Coast FIRE +5y
    ['Coast FIRE (-5y)', 'hsl(140, 74%, 53%)'], // lighter jade for Coast FIRE -5y
  ]);

  colorScheme = {
    domain: [], // Will be populated dynamically
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
    this.scheduleDrawAdjustmentMarkers();
  }

  ngAfterContentInit() {
    this.setViewDimensions();
    this.scheduleDrawAdjustmentMarkers();
  }

  ngOnChanges(changes: SimpleChanges): void {
    this.calculateData();
    this.scheduleDrawAdjustmentMarkers();
  }

  onSelect($event) {}

  onLegendLabelClick(entry: any) {
    const seriesName = entry.label || entry.name;

    if (this.hiddenSeries.has(seriesName)) {
      // Show the series
      this.hiddenSeries.delete(seriesName);
    } else {
      // Hide the series
      this.hiddenSeries.add(seriesName);
    }

    this.updateFilteredData();
  }

  private updateFilteredData() {
    this.filteredData = this.data.filter(
      (series) => !this.hiddenSeries.has(series.name)
    );

    // Update color scheme to match filtered data with static colors
    this.colorScheme.domain = this.filteredData.map((series) =>
      this.getSeriesColor(series.name)
    );
    this.scheduleDrawAdjustmentMarkers();
  }

  private scheduleDrawAdjustmentMarkers() {
    // ngx-charts renders async; defer until the SVG is in place.
    // Double-fire: first attempt in case it's fast, second as backup.
    setTimeout(() => this.drawAdjustmentMarkers(), 100);
    setTimeout(() => this.drawAdjustmentMarkers(), 500);
  }

  private drawAdjustmentMarkers() {
    if (!this.elementView?.nativeElement) return;
    const root: HTMLElement = this.elementView.nativeElement;
    const svg = root.querySelector(
      'ngx-charts-line-chart svg'
    ) as SVGSVGElement | null;
    if (!svg) return;

    const existing = svg.querySelector('g.adjustment-markers');
    if (existing) existing.parentNode?.removeChild(existing);

    const adjustments = this.calculateInput?.contributionAdjustments;
    if (!adjustments?.length) return;
    const forecasts = this.forecast?.monthlyForecasts;
    if (!forecasts?.length) return;

    const xAxisDomain = svg.querySelector(
      'g.x.axis path.domain'
    ) as SVGGraphicsElement | null;
    const yAxisDomain = svg.querySelector(
      'g.y.axis path.domain'
    ) as SVGGraphicsElement | null;
    if (!xAxisDomain || !yAxisDomain) return;

    const chartWidth = xAxisDomain.getBBox().width;
    const chartHeight = yAxisDomain.getBBox().height;
    if (chartWidth <= 0 || chartHeight <= 0) return;

    const plotGroup = xAxisDomain.parentNode?.parentNode as SVGGElement | null;
    if (!plotGroup) return;

    const firstDate = forecasts[0].date.getTime();
    const lastDate = forecasts[forecasts.length - 1].date.getTime();
    const dateRange = lastDate - firstDate;
    if (dateRange <= 0) return;

    const fiNumber = this.calculateInput?.fiNumber || 0;
    const NS = 'http://www.w3.org/2000/svg';
    const overlay = document.createElementNS(NS, 'g');
    overlay.setAttribute('class', 'adjustment-markers');
    overlay.setAttribute('pointer-events', 'none');
    plotGroup.appendChild(overlay);

    adjustments.forEach((adj, idx) => {
      const startDate = new Date(adj.startDate);
      const t = startDate.getTime();
      if (isNaN(t) || t < firstDate || t > lastDate) return;

      const x = ((t - firstDate) / dateRange) * chartWidth;

      const match = forecasts.find(
        (f) =>
          f.date.getFullYear() === startDate.getFullYear() &&
          f.date.getMonth() === startDate.getMonth()
      );
      const pctLabel =
        match && fiNumber > 0
          ? `${Math.round((match.netWorth / fiNumber) * 100)}% of FIRE`
          : '';

      const dateLabel = startDate.toLocaleString(this.locale, {
        month: 'short',
        year: 'numeric',
      });
      const label = [adj.name, dateLabel, pctLabel]
        .filter(Boolean)
        .join(' • ');

      const line = document.createElementNS(NS, 'line');
      line.setAttribute('x1', `${x}`);
      line.setAttribute('x2', `${x}`);
      line.setAttribute('y1', '0');
      line.setAttribute('y2', `${chartHeight}`);
      line.setAttribute('stroke', 'hsl(210, 20%, 50%)');
      line.setAttribute('stroke-width', '1');
      line.setAttribute('stroke-dasharray', '4,3');
      line.setAttribute('opacity', '0.7');
      overlay.appendChild(line);

      const text = document.createElementNS(NS, 'text');
      text.setAttribute('x', `${x + 4}`);
      text.setAttribute('y', `${12 + (idx % 2) * 14}`);
      text.setAttribute('font-size', '11px');
      text.setAttribute('fill', 'hsl(210, 20%, 35%)');
      text.textContent = label;
      overlay.appendChild(text);
    });
  }

  isSeriesHidden(seriesName: string): boolean {
    return this.hiddenSeries.has(seriesName);
  }

  getSeriesColor(seriesName: string): string {
    return this.seriesColorMap.get(seriesName) || '#5AA454'; // Default color if not found
  }

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
      const fiNumber = this.calculateInput?.fiNumber;
      if (fiNumber && fiNumber > 0) {
        const pct = Math.round((tooltipItem.value / fiNumber) * 100);
        result += ` (${pct}% of FIRE)`;
      }
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

    // Initialize filtered data (show all series by default)
    this.updateFilteredData();
  }

  private formatCurrency(val: number): string {
    const absVal = Math.abs(val);
    const isNegative = val < 0;
    const prefix = isNegative ? '-' : '';

    // Get currency symbol
    const currencySymbol = new Intl.NumberFormat(this.locale, {
      style: 'currency',
      currency: this.currencyIsoCode,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })
      .format(0)
      .replace(/\d/g, '')
      .trim();

    if (absVal >= 1000000000) {
      // Billions: 1.25B
      const billions = absVal / 1000000000;
      return `${prefix}${currencySymbol}${billions.toFixed(
        billions >= 10 ? 1 : 2
      )}B`;
    } else if (absVal >= 1000000) {
      // Millions: 1.25M
      const millions = absVal / 1000000;
      return `${prefix}${currencySymbol}${millions.toFixed(
        millions >= 10 ? 1 : 2
      )}M`;
    } else if (absVal >= 1000) {
      // Thousands: 980k
      const thousands = absVal / 1000;
      return `${prefix}${currencySymbol}${thousands.toFixed(
        thousands >= 10 ? 0 : 1
      )}k`;
    } else {
      // Less than 1000: show full amount
      return new Intl.NumberFormat(this.locale, {
        style: 'currency',
        currency: this.currencyIsoCode,
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(val);
    }
  }
}
