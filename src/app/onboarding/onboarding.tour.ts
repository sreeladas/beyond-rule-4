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
        'This tool projects when your savings and investments could cover your living expenses permanently. ' +
        'You are viewing sample data. You can edit any input while this guide is open — results update immediately.',
    },
    {
      selector: '[data-tour="birth-date"]',
      accordionId: 'settings',
      text: 'Your birthdate. Used to show your age at each projected milestone.',
    },
    {
      selector: '[data-tour="retirement-age"]',
      accordionId: 'settings',
      text: 'The age you want to retire. The projection measures progress against this target.',
    },
    {
      selector: '[data-tour="starting-balance"]',
      accordionId: 'net-worth',
      text:
        'Your current savings and investments. This is the starting balance that compounds over time. ' +
        'Replace the sample values with your own — rough numbers are fine.',
    },
    {
      selector: '[data-tour="monthly-contributions"]',
      accordionId: 'contributions',
      text:
        'How much you invest each month. ' +
        'This is the single most impactful input — increasing it moves the projected date forward.',
    },
    {
      selector: '[data-tour="retirement-expenses"]',
      accordionId: 'expenses',
      position: 'top',
      text:
        'Your monthly living costs. The tool calculates how large your portfolio needs to be ' +
        'to cover these expenses indefinitely using a safe withdrawal rate.',
    },
    {
      selector: '[data-tour="forecast-results"]',
      position: 'top',
      text:
        'Your results. All numbers update live as you change inputs above. ' +
        'To use real data, connect your YNAB budget via the Authorize button in the menu.',
    },
    {
      selector: '[data-tour="contribution-adjustments"]',
      accordionId: 'adjustments',
      text:
        "Don't like the timeline? Plan contribution adjustments based on " +
        'foreseeable life events — certification, promotions, new jobs.',
    },
  ];
}

function getYnabConnectedSteps(): TourStep[] {
  return [
    {
      text:
        'Your YNAB budget is connected. ' +
        'Your data is only used in this browser and is not stored on any server.',
    },
    {
      selector: '[data-tour="starting-balance"]',
      accordionId: 'net-worth',
      text:
        'Your starting balance from YNAB off-budget accounts. ' +
        'You can override values here — overrides are not saved and will be lost on refresh.',
    },
    {
      selector: '[data-tour="monthly-contributions"]',
      accordionId: 'contributions',
      text:
        'Monthly contributions from YNAB category groups named ' +
        'Financial Independence, Investments, or Retirement. ' +
        "Add <code>BR4 + amount</code> to a category's notes to include extra contributions.",
    },
    {
      selector: '[data-tour="retirement-expenses"]',
      accordionId: 'expenses',
      position: 'top',
      text:
        'Monthly expenses from your YNAB budget. ' +
        'Debt and investment categories are excluded. ' +
        "Add <code>BR4 FI amount</code> to a category's notes to override it.",
    },
    {
      selector: '[data-tour="birth-date"]',
      accordionId: 'settings',
      text: 'Set your birthdate and retirement age. These set the timeline for all projections.',
    },
    {
      selector: '[data-tour="forecast-results"]',
      position: 'top',
      text: 'Your results, updated live as you change inputs.',
    },
    {
      selector: '[data-tour="contribution-adjustments"]',
      accordionId: 'adjustments',
      text:
        "Don't like the timeline? Plan contribution adjustments based on " +
        'foreseeable life events — certification, promotions, new jobs.',
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
