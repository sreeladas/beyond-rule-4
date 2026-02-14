import Shepherd from 'shepherd.js';

export function buildOnboardingTour() {
  const tour = new Shepherd.Tour({
    defaultStepOptions: {
      scrollTo: true,
      cancelIcon: { enabled: true }
    }
  });

  const steps = [
    {
      selector: '[data-tour="birth-date"]',
      text:
        'Set your age under Settings to correctly reflect projected dates and ages. ' +
        'This affects growth by changing how long your money can compound, ' +
        'and determines when Coast FIRE and FIRE can occur.'
    },
    {
      selector: '[data-tour="starting-balance"]',
      text:
        'Check/update your current savings/investment balance under Starting Portfolio. ' +
        'This is normally read from YNAB and kept in sync. ' +
        'Changes here are simulation-only and not saved.'
    },
    {
      selector: '[data-tour="monthly-contribution"]',
      text:
        'Check/update the amount you invest each month under Contributions. ' +
        'A primary driver of how quickly your portfolio grows.'
    },
    {
      selector: '[data-tour="expected-return"]',
      text:
        'Assumed long-term return. ' +
        'Strongly affects growth rate and long-term results.'
    },
    {
      selector: '[data-tour="retirement-expenses"]',
      text:
        'Expected ongoing expenses in retirement. ' +
        'Exclude temporary costs. Include age-related expenses. ' +
        'Used to determine your FIRE target.'
    },
    {
      selector: '[data-tour="forecast-chart"]',
      text:
        'Shows projected portfolio value, Coast FIRE, and FIRE dates. ' +
        'Updates immediately as inputs change.'
    }
  ];

  steps.forEach((s, i) => {
    tour.addStep({
      attachTo: { element: s.selector, on: 'bottom' },
      text: `${s.text}<br/><small>${i + 1} / ${steps.length}</small>`,
      buttons: [
        i > 0 && { text: 'Back', action: tour.back },
        { text: i === steps.length - 1 ? 'Done' : 'Next', action: tour.next }
      ].filter(Boolean)
    });
  });

  tour.addStep({
    text:
      'This view helps you interpret the results of a financial model. ' +
      'The outputs reflect the assumptions you entered — not a prediction. ' +
      'Use the results to assess sufficiency, timing, and sensitivity to change.',
    buttons: [{ text: 'Done', action: tour.complete }]
  });

  return tour;
}

