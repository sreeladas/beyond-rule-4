import Shepherd from 'shepherd.js';

interface TourStep {
  selector?: string;
  text: string;
  accordionId?: string;
  position?: string;
}

function ensureAccordionOpen(accordionKey: string): Promise<void> {
  return new Promise((resolve) => {
    let attempts = 0;
    const tryOpen = () => {
      const panel = document.querySelector(
        `[data-accordion="${accordionKey}"]`,
      );
      if (!panel) {
        attempts++;
        if (attempts < 30) {
          setTimeout(tryOpen, 100);
        } else {
          resolve();
        }
        return;
      }
      const btn = panel.querySelector('button.collapsed');
      if (!btn) {
        resolve();
        return;
      }
      (btn as HTMLElement).click();
      setTimeout(resolve, 500);
    };
    tryOpen();
  });
}

function getSampleDataSteps(): TourStep[] {
  return [
    {
      text:
        'Welcome! This tool forecasts when your investments could cover your living expenses permanently.' +
        '<br/><br/>' +
        'You are viewing sample data. Edit any input as you go and results will update immediately.',
    },
    {
      selector: '[data-tour="birth-date"]',
      accordionId: 'settings',
      text: 'Enter your birthdate. This sets your timeline so milestones are shown at the age you would reach them.',
    },
    {
      selector: '[data-tour="retirement-age"]',
      accordionId: 'settings',
      text: 'Set your target retirement age. The forecast measures how far you are from this goal.',
    },
    {
      selector: '[data-tour="starting-balance"]',
      accordionId: 'net-worth',
      text:
        'Enter what you have saved and invested today. Rough numbers are fine.' +
        '<br/><br/>' +
        'The forecast assumes this is invested and growing at the recent average annual growth rate (7%). You can adjust ' +
        'this expectation above. Note that saving without some sort of return will not produce these results.' +
        '<br/><br/>' +
        'The default currency used is CAD, but this can be updated in settings above.',
    },
    {
      selector: '[data-tour="monthly-contributions"]',
      accordionId: 'contributions',
      text:
        'Enter how much you invest each month.' +
        '<br/><br/>' +
        'This has the biggest impact on your timeline, and even small increases move the date forward.',
    },
    {
      selector: '[data-tour="retirement-expenses"]',
      accordionId: 'expenses',
      position: 'top',
      text:
        'Enter your monthly living costs.' +
        '<br/><br/>' +
        'These determine how large your portfolio needs to grow before it can sustain you indefinitely.',
    },
    {
      selector: '[data-tour="forecast-results"]',
      position: 'top',
      text: 'Check your results here. They update live as you change inputs.',
    },
    {
      selector: '[data-tour="contribution-adjustments"]',
      accordionId: 'adjustments',
      text:
        "Don't like your timeline?" +
        '<br/><br/>' +
        'Plan future changes to your contributions like a raise, a new job, or paying off a loan, and see how they shift your projected date.',
    },
    {
      text:
        'This tool works best with <b>YNAB</b> (You Need a Budget), an envelope-based budgetting app that helps you track ' +
        'your spending, savings, and investments.' +
        '<br/><br/>' +
        'If you use YNAB, connect your budget via the Authorize button in the menu. ' +
        'Your portfolio, contributions, and expenses will then be pulled in automatically.',
    },
  ];
}

function getYnabConnectedSteps(): TourStep[] {
  return [
    {
      text:
        'Your YNAB budget is connected.' +
        '<br/><br/>' +
        'Your data stays in this browser and nothing is stored on any server.',
    },
    {
      selector: '[data-tour="starting-balance"]',
      accordionId: 'net-worth',
      text:
        'Review your starting portfolio, pulled from YNAB off-budget accounts.' +
        '<br/><br/>' +
        'You can override any value here to explore what-if scenarios, but these are not stored and ' +
        'will reset on refresh. To make changed persist, update the account balance in YNAB or add a ' +
        'note with <code>FF amount</code> to set a static override.',
    },
    {
      selector: '[data-tour="monthly-contributions"]',
      accordionId: 'contributions',
      text:
        'Review your monthly contributions, pulled from YNAB groups named ' +
        'Financial Independence, Investments, or Retirement.' +
        '<br/><br/>' +
        "Add <code>FF + amount</code> in an category's notes to include off-budget contributions like an employer match." +
        '<br/><br/>' +
        'Additionally use <code>FF +tax-free amount</code> or <code> FF +tax-deferred amount</code> (e.g. <code>FF +tax-free 240</code>) ' +
        'to include contributions that are not reflected in your ynab plan, like an employer match to retirement contribution.',
    },
    {
      selector: '[data-tour="retirement-expenses"]',
      accordionId: 'expenses',
      position: 'top',
      text:
        'Review your monthly expenses from YNAB. Debt and investment categories are excluded automatically.' +
        '<br/><br/>' +
        "Add <code>FF FI amount</code> in a category's notes to override what counts toward your FI budget.",
    },
    {
      selector: '[data-tour="birth-date"]',
      accordionId: 'settings',
      text:
        'Confirm your birthdate.' +
        '<br/><br/>' +
        'This sets your timeline so milestones are shown at the age you would reach them.',
    },
    {
      selector: '[data-tour="retirement-age"]',
      accordionId: 'settings',
      text:
        'Confirm your target retirement age.' +
        '<br/><br/>' +
        'Coast FIRE numbers are calculated based on this age.',
    },
    {
      selector: '[data-tour="forecast-results"]',
      position: 'top',
      text: 'Check your results. They update live as you change any input above.',
    },
    {
      selector: '[data-tour="contribution-adjustments"]',
      accordionId: 'adjustments',
      text:
        "Don't like your timeline?" +
        '<br/><br/>' +
        'Plan future changes to your contributions like a raise, a new job, or paying off a loan, and see how they shift your projected date.',
    },
  ];
}

export function buildOnboardingTour(isUsingSampleData: boolean) {
  const tour = new Shepherd.Tour({
    defaultStepOptions: {
      scrollTo: true,
      cancelIcon: { enabled: true },
    },
  });

  const steps = isUsingSampleData
    ? getSampleDataSteps()
    : getYnabConnectedSteps();

  steps.forEach((s, i) => {
    const stepOptions: any = {
      text: `${s.text}<br/><small>${i + 1} / ${steps.length}</small>`,
      buttons: [
        i > 0 && { text: '<', action: tour.back },
        {
          text: i === steps.length - 1 ? 'Done' : '>',
          action: i === steps.length - 1 ? tour.complete : tour.next,
        },
      ].filter(Boolean),
    };

    if (s.selector) {
      stepOptions.attachTo = {
        element: s.selector,
        on: s.position || 'bottom',
      };
    }

    if (s.accordionId) {
      stepOptions.beforeShowPromise = () => ensureAccordionOpen(s.accordionId);
    }

    tour.addStep(stepOptions);
  });

  return tour;
}
