# fastFIREward

A Financial Independence (FIRE) forecasting tool that integrates with the YNAB (You Need A Budget) API.

Forked from [Beyond Rule 4](https://beyondrule4.jmmorrissey.com/) which received an [honorable mention](https://www.youneedabudget.com/announcing-the-ynab-api-contest-winners/) in the YNAB API contest.

## Features

- Projects when savings and investments can cover living expenses permanently
- Pulls account balances, contributions, and expenses directly from YNAB
- Coast FIRE, Lean FI, and full FI projections with tax-adjusted FIRE numbers
- Contribution adjustments for life events (promotions, house purchase, etc.)
- Expense impact analysis — see how each spending category affects your FI date
- Guided onboarding tour for new users
- Multi-currency support
- Works with sample data for users not connected to YNAB
- All data stays in the browser — nothing is stored on any server

## Dev Instructions

### Development server

Run `ng serve` and navigate to `http://localhost:4200/`.

### Build

Run `ng build` to build the project. Build artifacts are stored in `dist/`.

### Running in Docker

Build and run:

```shell
docker build -t fastfi .
docker run --name fastfi -d -p 4200:80 fastfi
```

Navigate to http://localhost:4200.

### Using custom YNAB OAuth tokens

Register your own [YNAB API OAuth Application](https://api.youneedabudget.com/), then:

```shell
docker build -t fastfi .
docker run --name fastfi -d -p 8080:80 --env APP_URL="http://localhost:8080" --env CLIENT_ID="<CLIENT_ID_FROM_YNAB>" fastfi
```

## YNAB Note Commands

Override values pulled from YNAB by adding commands to category or account notes:

| Command | Where | Effect |
|---------|-------|--------|
| `FF + amount` | Category/Account Notes | Override balance or contribution with a specific amount |
| `FF +` | Category/Account Notes | Include YNAB balance regardless of group name |
| `FF +m amount` | Account Notes | Log a monthly contribution from an account |
| `FF FI amount` | Category Notes | Override the FI budget for a category |
| `FF LFI amount` | Category Notes | Override the Lean FI budget for a category |
