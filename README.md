![CI](https://github.com/Nneoma01/toolshop-playwright/actions/workflows/playwright.yml/badge.svg)

# Toolshop Playwright Suite

End-to-end tests for [practicesoftwaretesting.com](https://practicesoftwaretesting.com) (the "Toolshop" demo), written in **TypeScript** with **Playwright**.

## Overview

A portfolio project that exercises a public e-commerce demo across its main user journeys. The suite is built around the concerns a QA engineer actually faces on a real codebase:

- **Readable tests** that follow Arrange / Act / Assert structure.
- **Auto-generated test data** so no two runs share the same customer, address or email.
- **Stable, test-id-first locators** that survive wording and layout changes.
- **Self-explaining failures** — when a form rejects data, the test reports which fields were invalid and what the page showed.
- **Known defects are tracked**, not hidden. `test.fixme` keeps them in the code as executable specifications of what the fix should look like.
- **Secrets stay out of the repo** — passwords live in `.env` locally and in GitHub Actions secrets in CI.
- **CI is realistic** — lint, format, typecheck and tests on every push.

## Tech stack

| Area           | Tool                                         |
| -------------- | -------------------------------------------- |
| Test runner    | [Playwright](https://playwright.dev/)        |
| Language       | TypeScript (strict mode)                     |
| Test data      | [faker-js](https://fakerjs.dev/)             |
| Env management | [dotenv](https://github.com/motdotla/dotenv) |
| Linting        | ESLint                                       |
| Formatting     | Prettier                                     |
| CI             | GitHub Actions                               |

## Prerequisites

- Node.js (LTS, 20 or newer)
- `npm`

## Setup

1. **Clone and install**

   ```bash
   git clone https://github.com/Nneoma01/toolshop-playwright.git
   cd toolshop-playwright
   npm ci
   ```

2. **Install Playwright browsers**

   ```bash
   npx playwright install --with-deps
   ```

3. **Create a local `.env`** from the template

   ```bash
   cp .env.example .env
   ```

   Generate a throwaway password and paste it after `TEST_USER_PASSWORD=` (no quotes, no spaces around `=`):

   ```bash
   node -e 'console.log("Aa1@" + require("crypto").randomBytes(8).toString("hex"))'
   ```

   `.env` is git-ignored. Never commit it. Never paste a real password here — the suite only ever registers throwaway accounts on the demo.

4. **Verify the setup**
   ```bash
   npm run lint
   npm run format:check
   npx tsc --noEmit
   ```

## Running tests

| Command                                     | Purpose                                                  |
| ------------------------------------------- | -------------------------------------------------------- |
| `npm test`                                  | Full suite on Chromium                                   |
| `npx playwright test tests/ui/home.spec.ts` | One spec file                                            |
| `npx playwright test --grep @smoke`         | Smoke subset only                                        |
| `npx playwright test --last-failed`         | Only the tests that failed last time                     |
| `npx playwright test --ui`                  | Playwright's visual runner (recommended for development) |
| `npx playwright test --debug`               | Headed, step-through debugger                            |
| `CROSS_BROWSER=1 npx playwright test`       | Also run on Firefox and WebKit                           |
| `npx playwright show-report`                | Open the HTML report in a browser                        |

## Project structure

```
tests/ui/
├── authentication.spec.ts   # Login page, registration, log in, forgot password
├── cart.spec.ts             # Adding items, quantity changes, remove, totals, ECO discount
├── categories.spec.ts       # Hand Tools / Special Tools / Other, sub-categories, filters
├── checkout-page.spec.ts    # Customer checkout to payment step
├── contact.spec.ts          # Contact form fields, subject list, submission
├── home.spec.ts             # Layout, product list, pagination, search, sort
└── products.spec.ts         # Product details, specifications, ECO badge, add-to-cart

.github/workflows/
└── playwright.yml           # CI pipeline

.env.example                 # Template for the local .env
playwright.config.ts         # Chromium-only by default
tsconfig.json                # Strict TypeScript settings
```

## Design decisions

### `data-test` locators

Toolshop uses the `data-test` attribute rather than Playwright's default `data-testid`. The config maps `getByTestId` to `data-test`, so locators stay stable even when visible text or layout changes:

```ts
use: {
  testIdAttribute: 'data-test',
},
```

### Country profiles for consistent address data

Rather than hard-coding addresses, test data is organised into **country profiles**. Each profile pairs a country with a postal-code generator and matching cities and states:

```ts
const COUNTRY_PROFILES: CountryProfile[] = [
  {
    code: 'NG',
    // Nigerian postal codes are 6 digits; '1' is the Lagos region
    generatePostalCode: () => `1${faker.string.numeric(5)}`,
    cities: ['Lagos', 'Ipaja', 'Ikeja', 'Ikorodu', 'Surulere', 'Yaba', 'Lekki', 'Victoria Island'],
    states: ['Lagos'],
  },
];
```

Every generated customer or address draws from one profile at random. Adding a new country takes a few lines; the whole suite picks it up automatically.

### Diagnostic helpers for form failures

When registration is rejected, `expectRegistrationAccepted` doesn't just fail — it reports:

- Which POST requests the form made (status, URL, response body)
- Which fields the form flagged as invalid
- The visible messages on the page
- The data that was used (password redacted)

A single error line turns a 30-second "something failed" into a precise "City is empty, invalid fields: city, state".

### Env vars for anything sensitive or environment-specific

| Variable             | Purpose                                     | Required                      |
| -------------------- | ------------------------------------------- | ----------------------------- |
| `TEST_USER_PASSWORD` | Password for throwaway registered customers | Yes                           |
| `TEST_EMAIL_DOMAIN`  | Domain for generated email addresses        | No, defaults to `example.com` |

Local: read from `.env`. CI: read from GitHub Actions secrets.

### `test.fixme` for known defects

Tests that exercise known-broken flows are marked `test.fixme`. They stay in the code as a specification of what the fix should look like, with a comment explaining the observed behaviour, and they don't fail the build. See [Known defects](#known-defects).

### `@smoke` tag for critical tests

A dozen tests covering the critical user journeys are tagged `@smoke`. Run them for a quick health check:

```bash
npx playwright test --grep @smoke
```

### Web-first assertions, no fixed timeouts

Every wait uses an auto-retrying assertion like `expect(locator).toBeVisible()` rather than `page.waitForTimeout(500)`. Failures print the actual observed state, which is far more useful than "the test timed out after 5 seconds".

## CI/CD

The pipeline runs in GitHub Actions on push and pull request to `main`:

1. **Lint** (ESLint)
2. **Format check** (Prettier)
3. **Typecheck** (`tsc --noEmit`)
4. **Install Playwright browsers** (cached between runs)
5. **Run the Playwright suite**

### Browsers

Chromium only by default. To include Firefox and WebKit, set `CROSS_BROWSER=1` on the workflow or in a local run.

### Workers

CI runs the suite with a single worker. The reason is pragmatic: the suite runs against the live `practicesoftwaretesting.com` demo, which is shared with other QA students and automation. Under parallel load the site slows down enough to time out well-behaved tests, so CI serialises to avoid overloading it. A run takes 10–15 minutes.

In a real project this suite would run against a locally stood-up copy of the app or a dedicated staging environment, where parallelism is safe and runtime is a minute or two.

### Secrets

The CI pipeline needs one repository secret:

- **`TEST_USER_PASSWORD`** — the same throwaway password that's in your local `.env`

Add it in **Settings → Secrets and variables → Actions → New repository secret**.

## Known limitations

### Cloudflare bot verification on CI runners

Four tests that depend on the registration → login redirect are marked
`test.fixme` on CI:

- `authentication: a new customer can register and is sent to the login page @smoke`
- `authentication: a registered customer can log in and sees their name @smoke`
- `checkout: a logged-in customer can move through the steps to payment @smoke`
- `checkout: a logged-in customer choosing credit card sees the card fields`

When the registration form submits, the server returns a 302 to `/auth/login`.
On shared GitHub Actions runner IPs, Cloudflare's bot-verification challenge
intercepts that navigation and serves an interstitial page instead of the login
form. Thirty-second waits do not help — Cloudflare does not resolve the
challenge for the Playwright-controlled browser.

The tests pass locally against the same site, where a residential IP and a
regular browsing session do not trigger the challenge.

The right fix is to bypass the UI redirect by registering through the Toolshop
REST API in a Playwright `setup` project, then reusing the resulting session
via `storageState`. That is tracked as a Week 2 improvement. In a real project,
CI would run against a locally stood-up copy of the application rather than
a public Cloudflare-protected demo.

## Known defects

The following `test.fixme` tests document behaviour observed on the live demo that is likely incorrect. They remain in the code as executable specifications of the expected fix.

| Test                                                                | Observed behaviour                                                                                                         |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `authentication: requesting a reset shows a confirmation`           | The Forgot Password submit button appeared to need two clicks                                                              |
| `checkout: a guest/customer can pay cash on delivery` (two tests)   | After clicking Finish, the cart stays full and the Finish button stays visible — the order appears not to have been placed |
| `contact: a valid message is sent / with an attachment` (two tests) | No confirmation is shown after submit                                                                                      |

To reproduce by hand before raising a bug, run them against the live site and compare with the test's assertion.

## npm scripts

| Script                 | Purpose                                   |
| ---------------------- | ----------------------------------------- |
| `npm test`             | Run the full Playwright suite             |
| `npm run lint`         | ESLint                                    |
| `npm run format`       | Rewrite files with Prettier               |
| `npm run format:check` | Fail if any file isn't Prettier-formatted |

## Author

**Michael Adeyeye** — QA Engineer
