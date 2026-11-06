# Toolshop Playwright Suite

End-to-end UI and API test suite for [practicesoftwaretesting.com](https://practicesoftwaretesting.com), built with Playwright and TypeScript.

![CI](https://github.com/mikekoe/toolshop-playwright/actions/workflows/playwright.yml/badge.svg)

## Overview

This repository covers the Toolshop demo site with:

- **UI tests** for authentication, product browsing, search, sort, cart, checkout, categories, and the contact form.
- **API tests** for the authentication endpoints, with typed request and response shapes.
- **An auth setup project** that registers a throwaway customer via the API once per run, injects the JWT into the Angular frontend's `localStorage`, and saves the browser session so every logged-in UI test starts authenticated.

Built as part of a quality engineering portfolio.

## Tech stack

- [Playwright](https://playwright.dev) + TypeScript (strict mode)
- Node.js LTS
- Prettier, ESLint, `eslint-plugin-playwright`
- [@faker-js/faker](https://fakerjs.dev) for test data
- GitHub Actions for CI

## Prerequisites

- Node.js LTS
- npm

## Setup

```bash
git clone https://github.com/Nneoma01/toolshop-playwright.git
cd toolshop-playwright
npm install
npx playwright install chromium
cp .env.example .env
# Edit .env and set TEST_USER_PASSWORD
```

### Environment variables

| Variable             | Purpose                                                             | Required?                            |
| -------------------- | ------------------------------------------------------------------- | ------------------------------------ |
| `TEST_USER_PASSWORD` | Password used when the setup project registers a throwaway customer | Required locally                     |
| `TEST_EMAIL_DOMAIN`  | Domain part of generated test emails                                | Optional (defaults to `example.com`) |
| `API_BASE_URL`       | Override the Toolshop API host                                      | Optional                             |
| `BASE_URL`           | Override the Toolshop frontend host                                 | Optional                             |

## Running tests

```bash
# Full chromium suite (default: runs setup first, then all tests)
npx playwright test

# Just the auth setup project
npx playwright test --project=setup

# UI tests only
npx playwright test tests/ui/

# API tests only
npx playwright test tests/api/

# Smoke tests across the suite
npx playwright test --grep @smoke

# Add firefox + webkit to the run
CROSS_BROWSER=1 npx playwright test

# Simulate CI locally (setup skips; auth-dependent tests skip)
CI=true npx playwright test

# Open the last HTML report
npx playwright show-report
```

## Project structure

```
.
├── .github/workflows/
│   └── playwright.yml           CI workflow
├── docs/
│   └── api.md                   Toolshop API discovery notes (9 endpoints)
├── playwright/
│   └── .auth/                   gitignored; populated by the setup project
│       ├── customer.json        Playwright storageState (cookies + localStorage)
│       └── credentials.json     email + password for API tests to read
├── tests/
│   ├── setup/
│   │   └── auth.setup.ts        Registers a throwaway customer per run
│   ├── api/
│   │   └── auth.spec.ts         HTTP tests for /users/login and /users/me
│   └── ui/
│       ├── authentication.spec.ts
│       ├── cart.spec.ts
│       ├── categories.spec.ts
│       ├── checkout-page.spec.ts
│       ├── contact.spec.ts
│       ├── home.spec.ts
│       └── products.spec.ts
├── .env.example                 Template for required environment variables
├── playwright.config.ts
└── README.md
```

## Design decisions

### Authenticate via the API, not the UI

The setup project registers a throwaway customer by calling `POST /users/register` directly rather than driving the UI register form. Three reasons:

- **Speed.** Skips the whole Angular form interaction per run.
- **Reliability.** Bypasses Cloudflare's bot interstitial on the UI register → login redirect (see Known limitations).
- **Isolation.** Fresh customer per run means no stale-session failures or cross-test contamination.

After registration, the setup opens a Chromium context, navigates to the frontend, injects the JWT into `localStorage` under the key Angular reads (`auth-token`), and saves the full `storageState`. Every UI test in the chromium project then starts already logged in.

### `storageState` by default, opt-out for logged-out flows

The chromium project declares `storageState: 'playwright/.auth/customer.json'` at the project level. Tests that need a logged-out browser (login page smoke, registration, forgot password) override with:

```ts
test.use({ storageState: { cookies: [], origins: [] } });
```

### Setup is conditional in CI

Toolshop's API rejects requests from shared CI runner IPs (see Known limitations). When the setup project skips, `playwright.config.ts` falls back to an empty `storageState`, and auth-dependent tests have their own `test.skip` guard tied to the missing credentials file. No fabricated coverage: tests that need auth skip with a documented reason; tests that don't still run.

### Flaky tests are not hidden

Tests that fail on CI runner IPs are marked `test.fixme` with a comment pointing to the Known limitations section. They pass locally. They're never papered over with silent retries or disabled-and-forgotten.

### Reliability settings

- `fullyParallel: true` locally; `workers: 1` in CI to stay well under Toolshop's rate limits.
- `retries: 2` on CI only.
- `trace: 'on-first-retry'` — every failure comes with a replayable trace.
- `screenshot: 'only-on-failure'` — failure context without the noise.
- `expect.timeout: 10_000` — longer default for Angular rendering.
- `testIdAttribute: 'data-test'` — Toolshop uses `data-test`, not `data-testid`.

### API discovery by Network-tab archaeology

The endpoints in `docs/api.md` were reverse-engineered from the Toolshop frontend's live traffic in Chrome DevTools, not from documentation. The notes include request shapes, response shapes, JWT claims (HS256, 5-minute lifetime), quirks (`house_number: string | null`), and the asymmetric error shapes (`{error: ...}` on login; `{message: ...}` on `/users/me`) that the tests exercise as contract assertions.

## CI/CD

GitHub Actions runs the full chromium suite on every push and pull request to `main`. The workflow uploads the HTML report as an artifact retained for 30 days.

Expected CI result with the current architecture: logged-out tests run and pass; auth-dependent tests skip with a documented reason; 0 failed.

## Known limitations

### Cloudflare blocks the UI register → login redirect on CI runner IPs

Toolshop's UI registration flow triggers a server-initiated 302 redirect from `/auth/register` to `/auth/login` after a successful register. On shared CI runner IPs, Cloudflare serves a "Performing security verification" interstitial for that redirect, and the login form never renders. The browser trace shows the Cloudflare Ray ID.

Four UI tests that depend on fresh UI registration are marked `test.fixme` with comments pointing here. They pass locally. The setup project sidesteps the problem by registering via API instead of the form.

### Toolshop API blocks shared CI runner IPs

The Toolshop demo API itself rejects requests from GitHub Actions runner IPs:

- `POST /users/register` returns `500 {"message": "Something went wrong"}`.
- Pre-registered accounts get reaped too quickly to hold as a GitHub Actions secret workaround.

As a result, the auth setup project skips in CI (`test.skip(IS_CI, '...')`), and every test that depends on an authenticated session skips with it via a `test.skip(!fs.existsSync(CREDENTIALS_FILE), '...')` guard. Logged-out tests still run in CI.

The full suite runs locally against the real site. This is the API-layer version of the Cloudflare block above — same root cause, different surface.

### Add-to-cart button intermittently stays disabled in CI

Tests that add a product to the cart (in `cart.spec.ts`, `home.spec.ts`, and
`products.spec.ts`) pass locally but intermittently fail in CI. The product
detail page loads and displays correctly, but Angular's reactive form validation
keeps the Add to Cart button disabled through 30-second retries.

Likely cause: a race between the quantity input initializing and the stock-check
API call completing. These tests are skipped in CI pending investigation.

The full cart flow runs locally.

## Known defects observed on Toolshop

Documented in the test files as `test.fixme` with `SUSPECTED DEFECT` comments, pending manual reproduction:

- The forgot-password submit button sometimes requires two clicks before the confirmation message appears.
- The register submit sometimes needs a second click after the password field has been blurred.
- `POST /users/login` returns `{error: "Unauthorized"}` on 401 while `GET /users/me` returns `{message: "Unauthorized"}` on the same status code — inconsistent error-body shapes across the auth endpoints.

## npm scripts

```bash
npm test                    # alias for npx playwright test
npm run format              # prettier --write .
npm run lint                # eslint .
```

## Author

Michael Adeyeye
