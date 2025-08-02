import { Component, OnInit, Input, OnChanges, SimpleChanges, ViewChild, ElementRef } from '@angular/core';

import { CalculateInput } from '../../models/calculate-input.model';
import { Forecast } from '../../models/forecast.model';

@Component({
    selector: 'app-projection-chart',
    templateUrl: './projection-chart.component.html',
    standalone: false
})
export class ProjectionChartComponent implements OnInit, OnChanges {

  @Input() calculateInput: CalculateInput;
  @Input() forecast: Forecast;
  @ViewChild('chartCanvas', { static: true }) chartCanvas: ElementRef<HTMLCanvasElement>;

  chartData: any;
  chartOptions: any;

  constructor() { }

  ngOnInit() {
    this.initializeChart();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes && this.calculateInput && this.forecast) {
      this.updateChartData();
    }
  }

  private initializeChart() {
    this.chartOptions = {
      responsive: true,
      plugins: {
        title: {
          display: true,
          text: 'Projected Savings Growth'
        },
        legend: {
          display: true,
          position: 'top'
        }
      },
      scales: {
        x: {
          display: true,
          title: {
            display: true,
            text: 'Date'
          }
        },
        y: {
          display: true,
          title: {
            display: true,
            text: 'Amount ($)'
          },
          ticks: {
            callback: function(value: any) {
              if (value >= 1000000) {
                return '$' + (value / 1000000).toFixed(1) + 'M';
              } else if (value >= 1000) {
                return '$' + (value / 1000).toFixed(0) + 'k';
              } else {
                return '$' + value.toLocaleString();
              }
            }
          }
        }
      },
      elements: {
        line: {
          tension: 0.4 // This creates smooth curves
        },
        point: {
          radius: 0 // Hide individual points for cleaner look
        }
      }
    };
  }

  private updateChartData() {
    if (!this.forecast || !this.forecast.monthlyForecasts) {
      return;
    }

    const labels = this.forecast.monthlyForecasts.map(f => f.toDateString());
    
    this.chartData = {
      labels: labels,
      datasets: [
        {
          label: 'Coast FIRE Number (+5y)',
          data: this.forecast.monthlyForecasts.map(f => f.coastFirePlusFive),
          borderColor: '#59a14f',
          backgroundColor: 'rgba(89, 161, 79, 0.1)',
          fill: false,
          tension: 0.4
        },
        {
          label: 'Coast FIRE Number',
          data: this.forecast.monthlyForecasts.map(f => f.coastFireNumber),
          borderColor: '#71cb64',
          backgroundColor: 'rgba(113, 203, 100, 0.1)',
          fill: false,
          tension: 0.4
        },
        {
          label: 'Coast FIRE Number (-5y)',
          data: this.forecast.monthlyForecasts.map(f => f.coastFireMinusFive),
          borderColor: '#8dd3c7',
          backgroundColor: 'rgba(141, 211, 199, 0.1)',
          fill: false,
          tension: 0.4
        },
        {
          label: 'Total Savings',
          data: this.forecast.monthlyForecasts.map(f => f.netWorth),
          borderColor: '#4e79a7',
          backgroundColor: 'rgba(78, 121, 167, 0.1)',
          fill: false,
          tension: 0.4,
          borderWidth: 3
        },
        {
          label: 'FIRE Number',
          data: this.forecast.monthlyForecasts.map(f => this.calculateInput.fiNumber),
          borderColor: '#e15759',
          backgroundColor: 'rgba(225, 87, 89, 0.1)',
          fill: false,
          tension: 0.4
        }
      ]
    };
  }

  formatCurrency(amount: number): string {
    if (amount >= 1_000_000) {
      return `$${(amount / 1_000_000).toFixed(2)}M`;
    } else if (amount >= 1_000) {
      return `$${(amount / 1_000).toFixed(1)}k`;
    } else {
      return `$${amount.toLocaleString()}`;
    }
  }
}