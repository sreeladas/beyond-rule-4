import {
  Component,
  Input,
  OnChanges,
  SimpleChanges,
  ViewChild,
  ElementRef,
  AfterViewInit,
  HostListener,
} from '@angular/core';
import { DebtInput } from '../models/debt-input.model';
import { Adjustment } from '../input/debt-input.component';
import { AmortizationResult } from '../models/amortization.model';
import { DebtCalculatorService } from '../services/debt-calculator.service';

@Component({
  selector: 'app-debt-output',
  templateUrl: 'debt-output.component.html',
  standalone: false,
})
export class DebtOutputComponent implements OnChanges, AfterViewInit {
  @ViewChild('chartContainer') chartContainer: ElementRef;
  @Input() debtInput: DebtInput;
  @Input() adjustments: Adjustment[] = [];

  baselineResult: AmortizationResult;
  adjustedResult: AmortizationResult;

  isSummaryCollapsed = false;
  isYearlyCollapsed = false;
  isScheduleCollapsed = true;

  // Chart properties
  chartData: any[] = [];
  view: [number, number];
  colorScheme = {
    domain: ['hsl(210, 100%, 39%)', '#5AA454'], // blue for baseline, green for adjusted
  };

  constructor(private calculator: DebtCalculatorService) {}

  ngAfterViewInit() {
    this.setChartDimensions();
  }

  @HostListener('window:resize')
  onResize() {
    this.setChartDimensions();
  }

  private setChartDimensions() {
    if (this.chartContainer) {
      const width = this.chartContainer.nativeElement.offsetWidth;
      this.view = [width, 300];
    }
  }

  ngOnChanges(changes: SimpleChanges) {
    if (this.debtInput) {
      this.calculateResults();
      this.buildChartData();
    }
  }

  private calculateResults() {
    this.baselineResult = this.calculator.generateAmortization(this.debtInput);

    this.adjustedResult = this.calculator.generateAmortization(
      this.debtInput,
      this.adjustments,
    );
  }

  private buildChartData() {
    if (!this.baselineResult || !this.adjustedResult) return;

    const baselineSeries = this.baselineResult.schedule.map((row) => ({
      name: row.date,
      value: row.balance,
    }));

    const adjustedSeries = this.adjustedResult.schedule.map((row) => ({
      name: row.date,
      value: row.balance,
    }));

    this.chartData = [{ name: 'Baseline', series: baselineSeries }];

    if (this.adjustments.length > 0) {
      this.chartData.push({ name: 'With Adjustments', series: adjustedSeries });
    }
  }

  formatDate(date: Date): string {
    return new Date(date).toLocaleDateString('en-CA', {
      year: 'numeric',
      month: 'short',
    });
  }

  yAxisTickFormatting = (val: number): string => {
    if (val >= 1000000) {
      return '$' + (val / 1000000).toFixed(1) + 'M';
    } else if (val >= 1000) {
      return '$' + (val / 1000).toFixed(0) + 'k';
    }
    return '$' + val.toFixed(0);
  };

  xAxisTickFormatting = (val: Date): string => {
    const date = new Date(val);
    return date.toLocaleDateString('en-CA', {
      year: 'numeric',
      month: 'short',
    });
  };

  tooltipDateFormat(val: Date | string): string {
    const date = new Date(val);
    return date.toLocaleDateString('en-CA', {
      year: 'numeric',
      month: 'short',
    });
  }

  get interestSaved(): number {
    if (!this.baselineResult || !this.adjustedResult) return 0;
    return (
      this.baselineResult.totalInterest - this.adjustedResult.totalInterest
    );
  }

  get monthsSaved(): number {
    if (!this.baselineResult || !this.adjustedResult) return 0;
    return this.baselineResult.payoffMonths - this.adjustedResult.payoffMonths;
  }
}
